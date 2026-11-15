import type { SearchBudget, SearchSpend, SearchUsage } from '../../src/jobs/search/budget.ts';
import type {
  JobPatch, JobProfile, JobRunStats, JobScore, JobSource, JobStore, JobTier, KnownJob, NewJob, PendingJob,
  ReportedJob, UnscoredJob, VerificationResult,
} from '../../src/jobs/types.ts';

export interface MemoryJob extends NewJob {
  id: string;
  verificationNote: string | null;
  isUpdate: boolean;
  reportDate: string | null;
  lastSeenAt: Date | null;
}

/** In-memory JobStore for pipeline tests. */
export class MemoryJobStore implements JobStore {
  jobs: MemoryJob[] = [];
  runs: Array<{ id: string; status: string; stats: JobRunStats | null; error: string | null }> = [];
  profiles: JobProfile[] = [{ id: 'p1', title: 'Android', text: 'Kotlin, 5 năm' }];
  scores: Array<JobScore & { jobId: string; profileId: string; tier: JobTier | null; reportDate: string }> = [];
  budget: SearchBudget | null = null;
  spend: SearchSpend = { monthCostUsd: 0, monthSearches: 0, todayCostUsd: 0 };
  spendRecords: Array<{ engineId: string; today: string; usage: SearchUsage; costUsd: number }> = [];
  private readonly sources: JobSource[];

  constructor(sources: JobSource[]) {
    this.sources = sources;
  }

  async loadSources(): Promise<JobSource[]> {
    return this.sources;
  }

  async loadProfiles(): Promise<JobProfile[]> {
    return this.profiles;
  }

  /** Test helper: one profile's score row of a job. */
  scoreOf(jobId: string, profileId = 'p1') {
    return this.scores.find((row) => row.jobId === jobId && row.profileId === profileId);
  }

  async loadSearchBudget(): Promise<SearchBudget | null> {
    return this.budget;
  }

  async loadSearchSpend(): Promise<SearchSpend> {
    return this.spend;
  }

  async recordSearchSpend(engineId: string, today: string, usage: SearchUsage, costUsd: number): Promise<void> {
    this.spendRecords.push({ engineId, today, usage, costUsd });
  }

  async startRun(): Promise<string> {
    const id = `run-${this.runs.length + 1}`;
    this.runs.push({ id, status: 'running', stats: null, error: null });
    return id;
  }

  async finishRun(runId: string, status: 'success' | 'partial' | 'failed', stats: JobRunStats, error: string | null): Promise<void> {
    this.runs = this.runs.map((run) => (run.id === runId ? { id: runId, status, stats, error } : run));
  }

  async findKnown(urlHashes: readonly string[], dedupeKeys: readonly string[]): Promise<KnownJob[]> {
    return this.jobs
      .filter((job) => urlHashes.includes(job.urlHash) || (job.dedupeKey !== null && dedupeKeys.includes(job.dedupeKey)))
      .map((job) => ({
        id: job.id, urlHash: job.urlHash, dedupeKey: job.dedupeKey, salary: job.salary,
        deadline: job.deadline, postedText: job.postedText, reportDate: job.reportDate,
      }));
  }

  async insertJobs(jobs: readonly NewJob[]): Promise<void> {
    for (const job of jobs) {
      this.jobs.push({
        ...job, id: `job-${this.jobs.length + 1}`, verificationNote: null, isUpdate: false, reportDate: null, lastSeenAt: null,
      });
    }
  }

  async touchJobs(ids: readonly string[], seenAt: Date): Promise<void> {
    this.patch(ids, { lastSeenAt: seenAt });
  }

  async updateJob(id: string, patch: JobPatch): Promise<void> {
    this.patch([id], patch);
    const { reportDate } = patch;
    if (reportDate !== undefined) this.scores = this.scores.map((row) => (row.jobId === id ? { ...row, reportDate } : row));
  }

  async loadPending(limit: number): Promise<PendingJob[]> {
    return this.jobs.filter((job) => job.verification === 'pending').slice(0, limit)
      .map((job) => ({ id: job.id, sourceId: job.sourceId, url: job.url, deadline: job.deadline }));
  }

  async saveVerification(id: string, result: VerificationResult): Promise<void> {
    this.patch([id], {
      verification: result.verification,
      verificationNote: result.note,
      ...(result.detailText !== null ? { detailText: result.detailText } : {}),
    });
  }

  async loadUnscored(profileId: string, _seenSince: Date, limit: number): Promise<UnscoredJob[]> {
    return this.jobs
      .filter((job) => (job.verification === 'verified' || job.verification === 'unverified') && !this.scoreOf(job.id, profileId))
      .slice(0, Math.max(0, limit));
  }

  async saveScore(jobId: string, profileId: string, score: JobScore, reportDate: string): Promise<void> {
    this.scores.push({ ...score, jobId, profileId, tier: null, reportDate });
    this.jobs = this.jobs.map((job) => (job.id === jobId && job.reportDate === null ? { ...job, reportDate } : job));
  }

  async loadReport(profileId: string, reportDate: string): Promise<ReportedJob[]> {
    return this.scores.filter((row) => row.profileId === profileId && row.reportDate === reportDate).map((row) => ({
      id: row.jobId, score: row.score, verification: this.jobs.find((job) => job.id === row.jobId)?.verification ?? 'pending',
    }));
  }

  async saveTiers(profileId: string, tiers: ReadonlyArray<{ readonly id: string; readonly tier: JobTier }>): Promise<void> {
    for (const { id, tier } of tiers) {
      this.scores = this.scores.map((row) => (row.jobId === id && row.profileId === profileId ? { ...row, tier } : row));
    }
  }

  private patch(ids: readonly string[], patch: Partial<MemoryJob>): void {
    this.jobs = this.jobs.map((job) => (ids.includes(job.id) ? { ...job, ...patch } : job));
  }
}
