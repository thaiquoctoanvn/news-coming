import { errorMessage, log } from '../log.ts';
import { AiUnavailableError, type AiRouter } from '../shared.ts';
import { dedupeKey, inScope, normalizeUrl, refreshedText, scanKeywords, urlHash, vietnamDate } from './filter.ts';
import type { PageReader } from './page-reader.ts';
import { type SearchEngines, discover } from './search/discover.ts';
import { SCORE_BATCH, assignTiers, scoreBatch } from './score.ts';
import type { JobAdapter } from './sources/index.ts';
import type { FoundJob, JobRunStats, JobStore, JobTrigger, KnownJob, NewJob, SourceStats } from './types.ts';
import { checkPosting } from './verify.ts';

// Daily job scan (docs/JOBS_PLAN.md §6): read listings → keep what is in scope → merge with known
// jobs → verify each new posting on its own page → score → group for today's report.
// Every step saves its result, so a run that stops (AI quota, timeout) is finished by the next one.

export interface JobRunOptions {
  readonly store: JobStore;
  readonly reader: PageReader;
  readonly router: AiRouter;
  readonly adapters: Readonly<Record<string, JobAdapter>>;
  readonly engines: SearchEngines;
  readonly trigger: JobTrigger;
  readonly now?: () => Date;
}

const MAX_VERIFY_PER_RUN = 80;
const MAX_SCORE_PER_RUN = 60;
// A profile added later only scores postings that are still current, not the whole history.
const SCORE_WINDOW_DAYS = 14;
const REPOSTED = 'đăng lại nhiều lần';
// A job that is still listed is shown again after this many days, so a long-running opening is not missed.
const REMIND_AFTER_DAYS = 14;
const DAY_MS = 86_400_000;

type Candidate = NewJob;

export async function runJobs(options: JobRunOptions): Promise<JobRunStats> {
  const { store } = options;
  const now = options.now ?? (() => new Date());
  const runId = await store.startRun(options.trigger);
  let stats: JobRunStats = { found: 0, inserted: 0, updated: 0, closed: 0, unverified: 0, scored: 0, sources: {} };
  try {
    const collected = await collect(options, now());
    stats = { ...stats, found: collected.candidates.length, sources: collected.sources };
    stats = { ...stats, ...await merge(store, collected.candidates, now()) };
    stats = { ...stats, ...await verify(options, now()) };
    const scoring = await score(options, now());
    stats = { ...stats, scored: scoring.scored };
    const failedSources = Object.values(stats.sources).some((source) => source.error);
    const status = scoring.stopped || failedSources ? 'partial' : 'success';
    await store.finishRun(runId, status, stats, scoring.stopped);
    log.info('jobs run finished', { status, ...stats });
    return stats;
  } catch (error: unknown) {
    await store.finishRun(runId, 'failed', stats, errorMessage(error).slice(0, 500));
    throw error;
  }
}

async function collect(options: JobRunOptions, now: Date): Promise<{ candidates: Candidate[]; sources: Record<string, SourceStats> }> {
  const sources: Record<string, SourceStats> = {};
  const byHash = new Map<string, Candidate>();
  const add = (jobs: readonly FoundJob[]): void => {
    for (const job of jobs) {
      const candidate = toCandidate(job);
      if (!byHash.has(candidate.urlHash)) byHash.set(candidate.urlHash, candidate);
    }
  };
  // Every enabled profile's keywords are searched once; each profile later scores only its own matches.
  const keywords = scanKeywords(await options.store.loadProfiles());
  if (keywords.length === 0) {
    log.warn('no enabled profile with keywords; nothing to look for');
    return { candidates: [], sources };
  }
  const enabled = await options.store.loadSources();
  for (const source of enabled) {
    const adapter = source.kind === 'direct' ? options.adapters[source.id] : undefined;
    if (!adapter) continue;
    try {
      const found = (await adapter(options.reader, now, keywords)).filter((job) => inScope(job, now, keywords));
      add(found);
      sources[source.id] = { found: found.length };
    } catch (error: unknown) {
      // One blocked site must not stop the others.
      sources[source.id] = { found: 0, error: errorMessage(error).slice(0, 200) };
      log.warn('job source failed', { source: source.id, error: errorMessage(error) });
    }
  }
  // Sites read directly come first, so a posting found both ways keeps its richer listing data.
  const searched = await discover({
    store: options.store, engines: options.engines, enabledSourceIds: new Set(enabled.map((source) => source.id)), keywords, now,
  });
  add(searched.jobs.filter((job) => inScope(job, now, keywords)));
  return { candidates: [...byHash.values()], sources: { ...sources, ...searched.sources } };
}

function toCandidate(job: FoundJob): Candidate {
  const url = normalizeUrl(job.url);
  return {
    sourceId: job.sourceId,
    foundVia: job.foundVia,
    url,
    urlHash: urlHash(url),
    dedupeKey: dedupeKey(job.company, job.title),
    title: job.title,
    company: job.company,
    location: job.location,
    salary: job.salary,
    postedText: refreshedText(job.postedAt),
    deadline: job.deadline,
    detailText: job.detailText,
    // Listings that carry the posting's own text and expiry (API sources) are already verified.
    verification: job.detailText ? 'verified' : 'pending',
  };
}

/** New postings are inserted; known ones are refreshed, and reported again when salary or deadline changed. */
async function merge(store: JobStore, candidates: readonly Candidate[], now: Date): Promise<{ inserted: number; updated: number }> {
  const keys = candidates.flatMap((candidate) => (candidate.dedupeKey ? [candidate.dedupeKey] : []));
  const known = await store.findKnown(candidates.map((candidate) => candidate.urlHash), keys);
  const byHash = new Map(known.map((job) => [job.urlHash, job]));
  const byKey = new Map(known.flatMap((job) => (job.dedupeKey ? [[job.dedupeKey, job] as const] : [])));

  const fresh: Candidate[] = [];
  const seenKeys = new Set<string>();
  const touched: string[] = [];
  let updated = 0;
  for (const candidate of candidates) {
    const existing = byHash.get(candidate.urlHash) ?? (candidate.dedupeKey ? byKey.get(candidate.dedupeKey) : undefined);
    if (existing) {
      touched.push(existing.id);
      if (await refresh(store, existing, candidate, now)) updated++;
    } else if (!candidate.dedupeKey || !seenKeys.has(candidate.dedupeKey)) {
      // The same position found on two sites in one run is kept once (first source wins).
      if (candidate.dedupeKey) seenKeys.add(candidate.dedupeKey);
      fresh.push(candidate);
    }
  }
  await store.insertJobs(fresh);
  await store.touchJobs(touched, now);
  return { inserted: fresh.length, updated };
}

async function refresh(store: JobStore, existing: KnownJob, candidate: Candidate, now: Date): Promise<boolean> {
  const reposted = existing.urlHash !== candidate.urlHash;
  const changed = (before: string | null, after: string | null): boolean => before !== null && after !== null && before !== after;
  const termsChanged = changed(existing.salary, candidate.salary) || changed(existing.deadline, candidate.deadline);
  const today = vietnamDate(now);
  const remind = existing.reportDate !== null && daysBetween(existing.reportDate, today) >= REMIND_AFTER_DAYS;
  if (!reposted && !termsChanged && !remind) return false;
  const posted = candidate.postedText ?? existing.postedText;
  const repostedText = posted?.includes(REPOSTED) ? posted : [posted, REPOSTED].filter(Boolean).join(' · ');
  // Only a job that was already shown is shown again, tagged "Cập nhật"; its score is kept.
  const showAgain = existing.reportDate !== null && (termsChanged || remind);
  await store.updateJob(existing.id, {
    // A position posted again under a new link: keep one job and point it at the newest link.
    ...(reposted ? { url: candidate.url, urlHash: candidate.urlHash, postedText: repostedText } : {}),
    ...(!reposted && remind && candidate.postedText ? { postedText: candidate.postedText } : {}),
    ...(termsChanged ? { salary: candidate.salary ?? existing.salary, deadline: candidate.deadline ?? existing.deadline } : {}),
    ...(showAgain ? { isUpdate: true, reportDate: today } : {}),
  });
  return showAgain;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

async function verify(options: JobRunOptions, now: Date): Promise<{ closed: number; unverified: number }> {
  const today = vietnamDate(now);
  let closed = 0;
  let unverified = 0;
  for (const job of await options.store.loadPending(MAX_VERIFY_PER_RUN)) {
    const result = await checkPosting(job, options.reader, today);
    await options.store.saveVerification(job.id, result);
    if (result.verification === 'closed') closed++;
    if (result.verification === 'unverified') unverified++;
  }
  return { closed, unverified };
}

/** Scores every pending job that matches a profile's keywords, once per enabled profile; each profile gets its own report for today. */
async function score(options: JobRunOptions, now: Date): Promise<{ scored: number; stopped: string | null }> {
  const { store } = options;
  const today = vietnamDate(now);
  const seenSince = new Date(now.getTime() - SCORE_WINDOW_DAYS * DAY_MS);
  const profiles = await store.loadProfiles();
    let scored = 0;
  let stopped: string | null = null;
  for (const profile of profiles) {
    const jobs = stopped ? [] : await store.loadUnscored(profile, seenSince, MAX_SCORE_PER_RUN - scored);
    for (let start = 0; start < jobs.length && !stopped; start += SCORE_BATCH) {
      const batch = jobs.slice(start, start + SCORE_BATCH);
      try {
        const scores = await scoreBatch(options.router, profile.text, batch);
        for (const [jobId, result] of scores) await store.saveScore(jobId, profile.id, result, today);
        scored += scores.size;
      } catch (error: unknown) {
        if (!(error instanceof AiUnavailableError)) throw error;
        // Out of free AI quota: the unscored jobs stay queued for the next run.
        stopped = errorMessage(error).slice(0, 300);
      }
    }
    // Reminders move old scores to today's report, so tiers are refreshed even when nothing was scored.
    await store.saveTiers(profile.id, assignTiers(await store.loadReport(profile.id, today)));
  }
  return { scored, stopped };
}
