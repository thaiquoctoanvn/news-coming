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

const JOB_COLUMNS = 'id, source_id, url, title, company, location, salary, posted_text, deadline, verification_note, score, reason, tip, tier, is_update';
const MAX_REPORT_DAYS = 90;

interface JobRow {
  id: string; source_id: string; url: string; title: string; company: string | null; location: string | null;
  salary: string | null; posted_text: string | null; deadline: string | null; verification_note: string | null;
  score: number | null; reason: string | null; tip: string | null; tier: JobTier | null; is_update: boolean;
}

/** Days that have a report, newest first. */
export async function fetchJobDates(db: SupabaseClient): Promise<string[]> {
  const rows = check(
    await db.from('jobs').select('report_date').not('report_date', 'is', null).order('report_date', { ascending: false }).limit(2000),
    'jobs',
  ) as Array<{ report_date: string }>;
  return [...new Set(rows.map((row) => row.report_date))].slice(0, MAX_REPORT_DAYS);
}

export async function fetchJobs(db: SupabaseClient, reportDate: string): Promise<Job[]> {
  const rows = check(
    await db.from('jobs').select(JOB_COLUMNS).eq('report_date', reportDate).neq('verification', 'closed')
      .order('score', { ascending: false, nullsFirst: false }).order('title'),
    'jobs',
  ) as JobRow[];
  return rows.map((row) => ({
    id: row.id, sourceId: row.source_id, url: row.url, title: row.title, company: row.company, location: row.location,
    salary: row.salary, postedText: row.posted_text, deadline: row.deadline, verificationNote: row.verification_note,
    score: row.score, reason: row.reason, tip: row.tip, tier: row.tier ?? 'low', isUpdate: row.is_update,
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

export async function fetchJobProfile(db: SupabaseClient): Promise<string> {
  return (await fetchSetting<{ text?: string }>(db, 'job_profile'))?.text ?? '';
}

export async function saveJobProfile(db: SupabaseClient, text: string): Promise<void> {
  check(await db.from('app_settings').upsert({ key: 'job_profile', value: { text: text.trim() } }).select('key'), 'app_settings');
}
