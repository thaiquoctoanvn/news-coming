import type { SearchBudget, SearchSpend, SearchUsage } from './search/budget.ts';

// Job board pipeline (docs/JOBS_PLAN.md): Android / mobile postings for the admin only.

export type JobSourceKind = 'direct' | 'listing_only' | 'search_only' | 'engine';
export type Verification = 'pending' | 'verified' | 'unverified' | 'closed';
export type JobTier = 'top' | 'fit' | 'maybe' | 'low' | 'unverified';
export type JobTrigger = 'schedule' | 'manual';

/** One scoring profile; every enabled profile gets its own scores and daily report. */
export interface JobProfile {
  readonly id: string;
  readonly title: string;
  readonly text: string;
}

export interface JobSource {
  readonly id: string;
  readonly kind: JobSourceKind;
}

/** A posting as read from a listing. Every field comes from the site itself; unknown stays null. */
export interface FoundJob {
  readonly sourceId: string;
  /** The search engine that found it, when the site itself cannot be read. */
  readonly foundVia: string | null;
  readonly url: string;
  readonly title: string;
  readonly company: string | null;
  readonly location: string | null;
  readonly salary: string | null;
  /** When the site last showed it as posted or refreshed (boards bump old postings). */
  readonly postedAt: Date | null;
  readonly deadline: string | null;
  /** Posting text when the listing already carries it (API sources); such jobs need no page read. */
  readonly detailText: string | null;
}

export interface NewJob {
  readonly sourceId: string;
  readonly foundVia: string | null;
  readonly url: string;
  readonly urlHash: string;
  readonly dedupeKey: string | null;
  readonly title: string;
  readonly company: string | null;
  readonly location: string | null;
  readonly salary: string | null;
  readonly postedText: string | null;
  readonly deadline: string | null;
  readonly detailText: string | null;
  readonly verification: Verification;
}

export interface KnownJob {
  readonly id: string;
  readonly urlHash: string;
  readonly dedupeKey: string | null;
  readonly salary: string | null;
  readonly deadline: string | null;
  readonly postedText: string | null;
  readonly reportDate: string | null;
}

export interface JobPatch {
  readonly url?: string;
  readonly urlHash?: string;
  readonly salary?: string | null;
  readonly deadline?: string | null;
  readonly postedText?: string | null;
  readonly isUpdate?: boolean;
  readonly reportDate?: string;
}

export interface PendingJob {
  readonly id: string;
  readonly sourceId: string;
  readonly url: string;
  readonly deadline: string | null;
}

export interface VerificationResult {
  readonly verification: Exclude<Verification, 'pending'>;
  readonly note: string | null;
  readonly detailText: string | null;
}

export interface UnscoredJob {
  readonly id: string;
  readonly title: string;
  readonly company: string | null;
  readonly location: string | null;
  readonly salary: string | null;
  readonly detailText: string | null;
}

export interface JobScore {
  readonly score: number;
  readonly reason: string;
  readonly tip: string | null;
}

export interface ReportedJob {
  readonly id: string;
  readonly score: number | null;
  readonly verification: Verification;
}

export interface SourceStats {
  readonly found: number;
  readonly error?: string;
}

export interface JobRunStats {
  readonly found: number;
  readonly inserted: number;
  readonly updated: number;
  readonly closed: number;
  readonly unverified: number;
  readonly scored: number;
  readonly sources: Readonly<Record<string, SourceStats>>;
}

export interface JobStore {
  /** Settings of the paid web search; null when missing or invalid (then it is not used). */
  loadSearchBudget(): Promise<SearchBudget | null>;
  /** Spend of one engine in the month of `today` (UTC) and on that day. */
  loadSearchSpend(engineId: string, today: string): Promise<SearchSpend>;
  recordSearchSpend(engineId: string, today: string, usage: SearchUsage, costUsd: number): Promise<void>;
  loadSources(): Promise<JobSource[]>;
  /** Enabled scoring profiles, oldest first. */
  loadProfiles(): Promise<JobProfile[]>;
  startRun(trigger: JobTrigger): Promise<string>;
  finishRun(runId: string, status: 'success' | 'partial' | 'failed', stats: JobRunStats, error: string | null): Promise<void>;
  findKnown(urlHashes: readonly string[], dedupeKeys: readonly string[]): Promise<KnownJob[]>;
  insertJobs(jobs: readonly NewJob[]): Promise<void>;
  touchJobs(ids: readonly string[], seenAt: Date): Promise<void>;
  updateJob(id: string, patch: JobPatch): Promise<void>;
  loadPending(limit: number): Promise<PendingJob[]>;
  saveVerification(id: string, result: VerificationResult): Promise<void>;
  /** Open jobs seen since `seenSince` that this profile has not scored yet, oldest first. */
  loadUnscored(profileId: string, seenSince: Date, limit: number): Promise<UnscoredJob[]>;
  saveScore(jobId: string, profileId: string, score: JobScore, reportDate: string): Promise<void>;
  loadReport(profileId: string, reportDate: string): Promise<ReportedJob[]>;
  saveTiers(profileId: string, tiers: ReadonlyArray<{ readonly id: string; readonly tier: JobTier }>): Promise<void>;
}
