import type { SupabaseClient } from '@supabase/supabase-js';

// Job board (admin only). Every call runs as the signed-in admin; RLS (is_admin) returns nothing
// to anyone else, so the page cannot leak even if its route is opened directly.

export type JobTier = 'top' | 'fit' | 'maybe' | 'low' | 'unverified';

export interface Job {
  readonly id: string;
  readonly sourceId: string;
  readonly url: string;
  readonly title: string;
  readonly company: string | null;
  readonly location: string | null;
  readonly salary: string | null;
  readonly postedText: string | null;
  readonly deadline: string | null;
  readonly verificationNote: string | null;
  readonly score: number | null;
  readonly reason: string | null;
  readonly tip: string | null;
  readonly tier: JobTier;
  readonly isUpdate: boolean;
}

export interface JobSource {
  readonly id: string;
  readonly name: string;
  readonly kind: 'direct' | 'listing_only' | 'search_only' | 'engine';
  readonly enabled: boolean;
}

export interface JobRun {
  readonly id: string;
  readonly startedAt: string;
  readonly status: string;
  readonly error: string | null;
  readonly stats: {
    readonly inserted?: number;
    readonly closed?: number;
    readonly unverified?: number;
    readonly scored?: number;
    readonly sources?: Readonly<Record<string, { readonly found: number; readonly error?: string }>>;
  };
}

export interface SearchStatus {
  /** Spend ceiling the worker stops at each month, in USD. */
  readonly monthlyStopUsd: number;
  readonly monthCostUsd: number;
  readonly monthSearches: number;
  /** Prepaid credit bought and when; null until the admin enters it. */
  readonly creditUsd: number | null;
  readonly creditDate: string | null;
  /** Spend since the credit was bought. */
  readonly spentSinceCreditUsd: number;
}

function check<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data as T;
}

export interface JobProfile {
  readonly id: string;
  /** Required; shown on the job page to pick this profile's report. */
  readonly title: string;
  readonly text: string;
  readonly enabled: boolean;
}

export const MAX_PROFILE_TITLE_CHARS = 80;
export const MAX_PROFILE_CHARS = 3_000;

export async function fetchJobProfiles(db: SupabaseClient): Promise<JobProfile[]> {
  const rows = check(
    await db.from('job_profiles').select('id, title, profile_text, enabled').order('created_at'),
    'job_profiles',
  ) as Array<{ id: string; title: string; profile_text: string; enabled: boolean }>;
  return rows.map((row) => ({ id: row.id, title: row.title, text: row.profile_text, enabled: row.enabled }));
}

/** Creates a profile (no id) or updates one. The title is required here and in the database. */
export async function saveJobProfile(db: SupabaseClient, profile: { id?: string; title: string; text: string }): Promise<void> {
  const title = profile.title.trim();
  if (!title) throw new Error('Cần nhập tiêu đề hồ sơ');
  const row = { title, profile_text: profile.text.trim() };
  const request = profile.id
    ? db.from('job_profiles').update(row).eq('id', profile.id).select('id')
    : db.from('job_profiles').insert(row).select('id');
  check(await request, 'job_profiles');
}

export async function setJobProfileEnabled(db: SupabaseClient, id: string, enabled: boolean): Promise<void> {
  check(await db.from('job_profiles').update({ enabled }).eq('id', id).select('id'), 'job_profiles');
}

/** Deletes a profile together with its scores and reports; the postings stay for the other profiles. */
export async function deleteJobProfile(db: SupabaseClient, id: string): Promise<void> {
  check(await db.from('job_profiles').delete().eq('id', id).select('id'), 'job_profiles');
}

const JOB_COLUMNS = 'id, source_id, url, title, company, location, salary, posted_text, deadline, verification, verification_note, is_update';
const MAX_REPORT_DAYS = 90;

interface ScoreRow {
  score: number;
  reason: string;
  tip: string | null;
  tier: JobTier | null;
  jobs: {
    id: string; source_id: string; url: string; title: string; company: string | null; location: string | null;
    salary: string | null; posted_text: string | null; deadline: string | null; verification_note: string | null; is_update: boolean;
  };
}

/** Days that have a report for one profile, newest first. */
export async function fetchJobDates(db: SupabaseClient, profileId: string): Promise<string[]> {
  const rows = check(
    await db.from('job_scores').select('report_date').eq('profile_id', profileId).order('report_date', { ascending: false }).limit(2000),
    'job_scores',
  ) as Array<{ report_date: string }>;
  return [...new Set(rows.map((row) => row.report_date))].slice(0, MAX_REPORT_DAYS);
}

/** One profile's report for a day: its scores joined to the shared postings, closed postings left out. */
export async function fetchJobs(db: SupabaseClient, profileId: string, reportDate: string): Promise<Job[]> {
  const rows = check(
    await db.from('job_scores').select(`score, reason, tip, tier, jobs!inner(${JOB_COLUMNS})`)
      .eq('profile_id', profileId).eq('report_date', reportDate).neq('jobs.verification', 'closed')
      .order('score', { ascending: false }),
    'job_scores',
  ) as unknown as ScoreRow[];
  return rows.map(({ jobs: job, ...score }) => ({
    id: job.id, sourceId: job.source_id, url: job.url, title: job.title, company: job.company, location: job.location,
    salary: job.salary, postedText: job.posted_text, deadline: job.deadline, verificationNote: job.verification_note,
    score: score.score, reason: score.reason, tip: score.tip, tier: score.tier ?? 'low', isUpdate: job.is_update,
  }));
}

export async function fetchJobSources(db: SupabaseClient): Promise<JobSource[]> {
  return check(await db.from('job_sources').select('id, name, kind, enabled').order('position'), 'job_sources') as JobSource[];
}

export async function setJobSourceEnabled(db: SupabaseClient, id: string, enabled: boolean): Promise<void> {
  check(await db.from('job_sources').update({ enabled }).eq('id', id).select('id'), 'job_sources');
}

export async function fetchJobRuns(db: SupabaseClient, limit: number): Promise<JobRun[]> {
  const rows = check(
    await db.from('job_runs').select('id, started_at, status, error, stats').order('started_at', { ascending: false }).limit(limit),
    'job_runs',
  ) as Array<{ id: string; started_at: string; status: string; error: string | null; stats: JobRun['stats'] }>;
  return rows.map((row) => ({ id: row.id, startedAt: row.started_at, status: row.status, error: row.error, stats: row.stats ?? {} }));
}

interface BudgetValue {
  monthly_stop_usd?: number;
  credit_usd?: number;
  credit_date?: string;
}

async function fetchSetting<T>(db: SupabaseClient, key: string): Promise<T | null> {
  const row = check(await db.from('app_settings').select('value').eq('key', key).maybeSingle(), 'app_settings') as { value: T } | null;
  return row?.value ?? null;
}

export async function fetchSearchStatus(db: SupabaseClient, now = new Date()): Promise<SearchStatus> {
  const budget = (await fetchSetting<BudgetValue>(db, 'job_search_budget')) ?? {};
  const monthStart = `${now.toISOString().slice(0, 7)}-01`;
  const since = budget.credit_date && budget.credit_date < monthStart ? budget.credit_date : monthStart;
  const rows = check(
    await db.from('search_spend').select('usage_date, searches, cost_usd').gte('usage_date', since),
    'search_spend',
  ) as Array<{ usage_date: string; searches: number; cost_usd: number | string }>;
  const sum = (from: string, pick: (row: (typeof rows)[number]) => number): number =>
    rows.filter((row) => row.usage_date >= from).reduce((total, row) => total + pick(row), 0);
  return {
    monthlyStopUsd: budget.monthly_stop_usd ?? 0,
    monthCostUsd: sum(monthStart, (row) => Number(row.cost_usd)),
    monthSearches: sum(monthStart, (row) => row.searches),
    creditUsd: budget.credit_usd ?? null,
    creditDate: budget.credit_date ?? null,
    spentSinceCreditUsd: budget.credit_date ? sum(budget.credit_date, (row) => Number(row.cost_usd)) : 0,
  };
}

/** Records a prepaid credit purchase; the other budget settings are kept. */
export async function saveSearchCredit(db: SupabaseClient, creditUsd: number, creditDate: string): Promise<void> {
  const current = (await fetchSetting<Record<string, unknown>>(db, 'job_search_budget')) ?? {};
  const value = { ...current, credit_usd: creditUsd, credit_date: creditDate };
  check(await db.from('app_settings').upsert({ key: 'job_search_budget', value }).select('key'), 'app_settings');
}

export interface ScanQuota {
  readonly dailyCap: number;
  readonly usedToday: number;
}

const DEFAULT_SCAN_CAP = 3;

/** Presses of "Quét ngay" today (UTC day, like the other buttons) against the daily cap. */
export async function fetchScanQuota(db: SupabaseClient, now = new Date()): Promise<ScanQuota> {
  const cap = (await fetchSetting<{ daily_cap?: number }>(db, 'job_scan'))?.daily_cap;
  const rows = check(
    await db.from('action_quota').select('count').eq('action', 'jobs').eq('usage_date', now.toISOString().slice(0, 10)),
    'action_quota',
  ) as Array<{ count: number }>;
  return {
    dailyCap: typeof cap === 'number' && cap > 0 ? cap : DEFAULT_SCAN_CAP,
    usedToday: rows.reduce((total, row) => total + row.count, 0),
  };
}

export const MIN_RETENTION_DAYS = 21;
const DEFAULT_RETENTION_DAYS = 30;

export async function fetchJobRetentionDays(db: SupabaseClient): Promise<number> {
  const days = (await fetchSetting<{ days?: number }>(db, 'job_retention'))?.days;
  return typeof days === 'number' ? Math.max(days, MIN_RETENTION_DAYS) : DEFAULT_RETENTION_DAYS;
}

export async function saveJobRetentionDays(db: SupabaseClient, days: number): Promise<void> {
  check(await db.from('app_settings').upsert({ key: 'job_retention', value: { days } }).select('key'), 'app_settings');
}
