import { z } from 'zod';
import type { AiRouter, ChatRequest } from '../shared.ts';
import type { JobScore, JobTier, ReportedJob, UnscoredJob } from './types.ts';

// Fit score of a posting against the admin's profile. The profile only ranks jobs; it never removes one.

export const SCORE_BATCH = 4;
const MAX_POSTING_CHARS = 1_500;
const TOP_COUNT = 3;
const TOP_MIN_SCORE = 6;

/** Used until the admin saves a profile on the operations page. Generic on purpose: the repo is public. */
export const DEFAULT_PROFILE = 'Android developer (Kotlin, Java), mid to senior level, looking for Android or mobile roles.';

const SYSTEM = `You rate how well job postings fit one candidate. Answer with JSON only:
{"jobs":[{"id":"j1","score":7,"reason":"...","tip":"..."}]}
Rules:
- score: integer 1-10. Higher when the posting's required skills, domain and seniority match the candidate's profile. Lower when the level is far from the candidate's experience (intern/junior, or lead/principal needing many more years) or when the role is mainly something else (embedded C++, AOSP, pure React Native, QA, iOS only).
- reason: one sentence in Vietnamese saying why it fits or not. Use only facts written in the posting and in the profile. Never invent salary, requirements or company facts.
- tip: for score >= 7 only, one or two points from the profile worth stressing in the CV for this posting, in Vietnamese. Otherwise null.
- When a posting has no text, rate from its title alone and say in the reason that only the title was available.
- Return every id exactly once.`;

const answerSchema = z.object({
  jobs: z.array(z.object({
    id: z.string(),
    score: z.number().int().min(1).max(10),
    reason: z.string().min(1).max(400),
    tip: z.string().max(500).nullish(),
  })),
});

export function buildScoreRequest(profile: string, jobs: readonly UnscoredJob[]): ChatRequest {
  const postings = jobs.map((job, index) => [
    `### j${index + 1}`,
    `Title: ${job.title}`,
    `Company: ${job.company ?? 'unknown'}`,
    `Location: ${job.location ?? 'unknown'}`,
    `Salary: ${job.salary ?? 'not shown'}`,
    `Posting text: ${job.detailText?.slice(0, MAX_POSTING_CHARS) ?? '(none)'}`,
  ].join('\n'));
  return {
    system: SYSTEM,
    user: `## Candidate profile\n${profile}\n\n## Postings\n${postings.join('\n\n')}`,
    maxOutputTokens: 200 * jobs.length + 100,
  };
}

/** Scores one batch; jobs the model skipped are simply left for the next run. */
export async function scoreBatch(router: AiRouter, profile: string, jobs: readonly UnscoredJob[]): Promise<Map<string, JobScore>> {
  const { data } = await router.complete('extract', buildScoreRequest(profile, jobs), answerSchema);
  const scores = new Map<string, JobScore>();
  for (const answer of data.jobs) {
    const job = jobs[Number(answer.id.replace(/^j/, '')) - 1];
    if (job) scores.set(job.id, { score: answer.score, reason: answer.reason.trim(), tip: answer.tip?.trim() || null });
  }
  return scores;
}

function tierForScore(score: number): JobTier {
  if (score >= 7) return 'fit';
  return score >= 5 ? 'maybe' : 'low';
}

/** Display groups for one day's report: unverified postings apart, the three best verified ones on top. */
export function assignTiers(jobs: readonly ReportedJob[]): Array<{ id: string; tier: JobTier }> {
  const verified = jobs.filter((job) => job.verification === 'verified' && job.score !== null);
  const top = new Set(
    [...verified].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .filter((job) => (job.score ?? 0) >= TOP_MIN_SCORE).slice(0, TOP_COUNT).map((job) => job.id),
  );
  return jobs.map((job) => {
    if (job.verification !== 'verified') return { id: job.id, tier: 'unverified' as const };
    if (top.has(job.id)) return { id: job.id, tier: 'top' as const };
    return { id: job.id, tier: tierForScore(job.score ?? 1) };
  });
}
