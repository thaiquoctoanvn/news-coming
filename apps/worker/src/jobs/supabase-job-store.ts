import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { type SearchBudget, type SearchSpend, type SearchUsage, searchBudgetSchema } from './search/budget.ts';
import type {
  JobPatch, JobProfile, JobRunStats, JobScore, JobSource, JobStore, JobTier, JobTrigger, KnownJob, NewJob,
  PendingJob, ReportedJob, UnscoredJob, VerificationResult,
} from './types.ts';

// Hash and key lists go into the query string; keep each request well under URL length limits.
const LOOKUP_CHUNK = 80;
// Open jobs looked at when finding what a profile has not scored yet (two weeks of postings is far fewer).
const UNSCORED_SCAN = 1_000;
const KNOWN_COLUMNS = 'id, url_hash, dedupe_key, salary, deadline, posted_text, report_date';

interface KnownRow {
  id: string;
  url_hash: string;
  dedupe_key: string | null;
  salary: string | null;
  deadline: string | null;
  posted_text: string | null;
  report_date: string | null;
}

export function createSupabaseJobStore(url: string, serviceRoleKey: string): JobStore {
  return new SupabaseJobStore(createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }));
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

class SupabaseJobStore implements JobStore {
  private readonly db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.db = db;
  }

  async loadSources(): Promise<JobSource[]> {
    const { data, error } = await this.db.from('job_sources').select('id, kind').eq('enabled', true).order('position');
    if (error) throw new Error(`load job sources: ${error.message}`);
    return data as JobSource[];
  }

  async loadProfiles(): Promise<JobProfile[]> {
    const { data, error } = await this.db.from('job_profiles').select('id, title, profile_text').eq('enabled', true).order('created_at');
    if (error) throw new Error(`load job profiles: ${error.message}`);
    return (data as Array<{ id: string; title: string; profile_text: string }>)
      .filter((row) => row.profile_text.trim() !== '')
      .map((row) => ({ id: row.id, title: row.title, text: row.profile_text.trim() }));
  }

  async loadSearchBudget(): Promise<SearchBudget | null> {
    const { data, error } = await this.db.from('app_settings').select('value').eq('key', 'job_search_budget').maybeSingle();
    if (error) throw new Error(`load search budget: ${error.message}`);
    // A broken setting must switch paid search off, never let it run without limits.
    const parsed = searchBudgetSchema.safeParse(data?.value);
    return parsed.success ? parsed.data : null;
  }

  async loadSearchSpend(engineId: string, today: string): Promise<SearchSpend> {
    const { data, error } = await this.db.from('search_spend').select('usage_date, searches, cost_usd')
      .eq('engine_id', engineId).gte('usage_date', `${today.slice(0, 7)}-01`).lte('usage_date', today);
    if (error) throw new Error(`load search spend: ${error.message}`);
    const rows = data as Array<{ usage_date: string; searches: number; cost_usd: number | string }>;
    return {
      monthCostUsd: rows.reduce((sum, row) => sum + Number(row.cost_usd), 0),
      monthSearches: rows.reduce((sum, row) => sum + row.searches, 0),
      todayCostUsd: rows.filter((row) => row.usage_date === today).reduce((sum, row) => sum + Number(row.cost_usd), 0),
    };
  }

  async recordSearchSpend(engineId: string, today: string, usage: SearchUsage, costUsd: number): Promise<void> {
    const { error } = await this.db.rpc('record_search_spend', {
      p_engine_id: engineId,
      p_usage_date: today,
      p_searches: usage.searches,
      p_tokens_in: usage.tokensIn,
      p_tokens_out: usage.tokensOut,
      p_cost_usd: costUsd,
    });
    if (error) throw new Error(`record search spend: ${error.message}`);
  }

  async startRun(trigger: JobTrigger): Promise<string> {
    const { data, error } = await this.db.from('job_runs').insert({ trigger }).select('id').single();
    if (error) throw new Error(`start job run: ${error.message}`);
    return (data as { id: string }).id;
  }

  async finishRun(runId: string, status: 'success' | 'partial' | 'failed', stats: JobRunStats, errorText: string | null): Promise<void> {
    const { error } = await this.db.from('job_runs')
      .update({ status, stats, error: errorText, finished_at: new Date().toISOString() }).eq('id', runId);
    if (error) throw new Error(`finish job run: ${error.message}`);
  }

  async findKnown(urlHashes: readonly string[], dedupeKeys: readonly string[]): Promise<KnownJob[]> {
    const rows = new Map<string, KnownRow>();
    const lookups: Array<['url_hash' | 'dedupe_key', string[]]> = [
      ...chunks(urlHashes, LOOKUP_CHUNK).map((chunk): ['url_hash', string[]] => ['url_hash', chunk]),
      ...chunks(dedupeKeys, LOOKUP_CHUNK).map((chunk): ['dedupe_key', string[]] => ['dedupe_key', chunk]),
    ];
    for (const [column, values] of lookups) {
      const { data, error } = await this.db.from('jobs').select(KNOWN_COLUMNS).in(column, values);
      if (error) throw new Error(`find known jobs: ${error.message}`);
      for (const row of data as KnownRow[]) rows.set(row.id, row);
    }
    return [...rows.values()].map((row) => ({
      id: row.id,
      urlHash: row.url_hash,
      dedupeKey: row.dedupe_key,
      salary: row.salary,
      deadline: row.deadline,
      postedText: row.posted_text,
      reportDate: row.report_date,
    }));
  }

  async insertJobs(jobs: readonly NewJob[]): Promise<void> {
    if (jobs.length === 0) return;
    const rows = jobs.map((job) => ({
      source_id: job.sourceId,
      found_via: job.foundVia,
      url: job.url,
      url_hash: job.urlHash,
      dedupe_key: job.dedupeKey,
      title: job.title,
      company: job.company,
      location: job.location,
      salary: job.salary,
      posted_text: job.postedText,
      deadline: job.deadline,
      detail_text: job.detailText,
      verification: job.verification,
    }));
    // A posting inserted by an overlapping run is not an error.
    const { error } = await this.db.from('jobs').upsert(rows, { onConflict: 'url_hash', ignoreDuplicates: true });
    if (error) throw new Error(`insert jobs: ${error.message}`);
  }

  async touchJobs(ids: readonly string[], seenAt: Date): Promise<void> {
    for (const chunk of chunks(ids, LOOKUP_CHUNK)) {
      const { error } = await this.db.from('jobs').update({ last_seen_at: seenAt.toISOString() }).in('id', chunk);
      if (error) throw new Error(`touch jobs: ${error.message}`);
    }
  }

  async updateJob(id: string, patch: JobPatch): Promise<void> {
    const row = {
      ...(patch.url !== undefined ? { url: patch.url } : {}),
      ...(patch.urlHash !== undefined ? { url_hash: patch.urlHash } : {}),
      ...(patch.salary !== undefined ? { salary: patch.salary } : {}),
      ...(patch.deadline !== undefined ? { deadline: patch.deadline } : {}),
      ...(patch.postedText !== undefined ? { posted_text: patch.postedText } : {}),
      ...(patch.isUpdate !== undefined ? { is_update: patch.isUpdate } : {}),
      ...(patch.reportDate !== undefined ? { report_date: patch.reportDate } : {}),
    };
    const { error } = await this.db.from('jobs').update(row).eq('id', id);
    if (error) throw new Error(`update job: ${error.message}`);
    if (patch.reportDate !== undefined) {
      // Shown again: the job moves to that day's report of every profile that scored it.
      const moved = await this.db.from('job_scores').update({ report_date: patch.reportDate }).eq('job_id', id);
      if (moved.error) throw new Error(`move job scores: ${moved.error.message}`);
    }
  }

  async loadPending(limit: number): Promise<PendingJob[]> {
    const { data, error } = await this.db.from('jobs').select('id, source_id, url, deadline')
      .eq('verification', 'pending').order('first_seen_at').limit(limit);
    if (error) throw new Error(`load pending jobs: ${error.message}`);
    return (data as Array<{ id: string; source_id: string; url: string; deadline: string | null }>)
      .map((row) => ({ id: row.id, sourceId: row.source_id, url: row.url, deadline: row.deadline }));
  }

  async saveVerification(id: string, result: VerificationResult): Promise<void> {
    const { error } = await this.db.from('jobs').update({
      verification: result.verification,
      verification_note: result.note,
      ...(result.detailText !== null ? { detail_text: result.detailText } : {}),
    }).eq('id', id);
    if (error) throw new Error(`save verification: ${error.message}`);
  }

  async loadUnscored(profileId: string, seenSince: Date, limit: number): Promise<UnscoredJob[]> {
    if (limit <= 0) return [];
    const open = await this.db.from('jobs').select('id, title, company, location, salary, detail_text')
      .in('verification', ['verified', 'unverified']).gte('last_seen_at', seenSince.toISOString())
      .order('first_seen_at').limit(UNSCORED_SCAN);
    if (open.error) throw new Error(`load unscored jobs: ${open.error.message}`);
    const rows = open.data as Array<Omit<UnscoredJob, 'detailText'> & { detail_text: string | null }>;
    const scored = new Set<string>();
    for (const chunk of chunks(rows.map((row) => row.id), LOOKUP_CHUNK)) {
      const { data, error } = await this.db.from('job_scores').select('job_id').eq('profile_id', profileId).in('job_id', chunk);
      if (error) throw new Error(`load job scores: ${error.message}`);
      for (const row of data as Array<{ job_id: string }>) scored.add(row.job_id);
    }
    return rows.filter((row) => !scored.has(row.id)).slice(0, limit)
      .map(({ detail_text, ...job }) => ({ ...job, detailText: detail_text }));
  }

  async saveScore(jobId: string, profileId: string, score: JobScore, reportDate: string): Promise<void> {
    const saved = await this.db.from('job_scores').upsert({
      job_id: jobId, profile_id: profileId, score: score.score, reason: score.reason, tip: score.tip, report_date: reportDate,
    });
    if (saved.error) throw new Error(`save score: ${saved.error.message}`);
    // First report of this job to any profile; a later profile does not move it.
    const { error } = await this.db.from('jobs').update({ report_date: reportDate }).eq('id', jobId).is('report_date', null);
    if (error) throw new Error(`mark job reported: ${error.message}`);
  }

  async loadReport(profileId: string, reportDate: string): Promise<ReportedJob[]> {
    const { data, error } = await this.db.from('job_scores').select('job_id, score, jobs!inner(verification)')
      .eq('profile_id', profileId).eq('report_date', reportDate);
    if (error) throw new Error(`load report: ${error.message}`);
    return (data as unknown as Array<{ job_id: string; score: number; jobs: { verification: ReportedJob['verification'] } }>)
      .map((row) => ({ id: row.job_id, score: row.score, verification: row.jobs.verification }));
  }

  async saveTiers(profileId: string, tiers: ReadonlyArray<{ readonly id: string; readonly tier: JobTier }>): Promise<void> {
    const byTier = new Map<JobTier, string[]>();
    for (const { id, tier } of tiers) byTier.set(tier, [...(byTier.get(tier) ?? []), id]);
    for (const [tier, ids] of byTier) {
      for (const chunk of chunks(ids, LOOKUP_CHUNK)) {
        const { error } = await this.db.from('job_scores').update({ tier }).eq('profile_id', profileId).in('job_id', chunk);
        if (error) throw new Error(`save tiers: ${error.message}`);
      }
    }
  }
}
