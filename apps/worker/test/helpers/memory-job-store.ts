import type {
  JobPatch, JobRunStats, JobScore, JobSource, JobStore, JobTier, KnownJob, NewJob, PendingJob,
  ReportedJob, UnscoredJob, VerificationResult,
} from '../../src/jobs/types.ts';

export interface MemoryJob extends NewJob {
  id: string;
  verificationNote: string | null;
  score: number | null;
  reason: string | null;
  tip: string | null;
  tier: JobTier | null;
  isUpdate: boolean;
  reportDate: string | null;
  lastSeenAt: Date | null;
}

/** In-memory JobStore for pipeline tests. */
export class MemoryJobStore implements JobStore {
  jobs: MemoryJob[] = [];
  runs: Array<{ id: string; status: string; stats: JobRunStats | null; error: string | null }> = [];
  profile: string | null = null;
  private readonly sources: JobSource[];

  constructor(sources: JobSource[]) {
    this.sources = sources;
  }

  async loadSources(): Promise<JobSource[]> {
    return this.sources;
  }

  async loadProfile(): Promise<string | null> {
    return this.profile;
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
        ...job, id: `job-${this.jobs.length + 1}`, verificationNote: null, score: null, reason: null,
        tip: null, tier: null, isUpdate: false, reportDate: null, lastSeenAt: null,
      });
    }
  }

  async touchJobs(ids: readonly string[], seenAt: Date): Promise<void> {
    this.patch(ids, { lastSeenAt: seenAt });
  }

  async updateJob(id: string, patch: JobPatch): Promise<void> {
    this.patch([id], patch);
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

  async loadUnscored(limit: number): Promise<UnscoredJob[]> {
    return this.jobs
      .filter((job) => (job.verification === 'verified' || job.verification === 'unverified') && job.reportDate === null)
      .slice(0, limit);
  }

  async saveScore(id: string, score: JobScore, reportDate: string): Promise<void> {
    this.patch([id], { ...score, reportDate });
  }

  async loadReport(reportDate: string): Promise<ReportedJob[]> {
    return this.jobs.filter((job) => job.reportDate === reportDate);
  }

  async saveTiers(tiers: ReadonlyArray<{ readonly id: string; readonly tier: JobTier }>): Promise<void> {
    for (const { id, tier } of tiers) this.patch([id], { tier });
  }

  private patch(ids: readonly string[], patch: Partial<MemoryJob>): void {
    this.jobs = this.jobs.map((job) => (ids.includes(job.id) ? { ...job, ...patch } : job));
  }
}
