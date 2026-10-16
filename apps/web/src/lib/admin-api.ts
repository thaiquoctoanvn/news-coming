import type { SupabaseClient } from '@supabase/supabase-js';

// Admin-only reads and config writes. Every call runs as the signed-in admin; RLS (is_admin)
// rejects them if the session is missing or older than 15 days.

export type Row = Record<string, unknown>;

function check<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data as T;
}

export interface TableQuery {
  readonly table: string;
  readonly topicId?: string;
  readonly order: string;
}

export async function fetchRows(db: SupabaseClient, query: TableQuery): Promise<Row[]> {
  let request = db.from(query.table).select('*');
  if (query.topicId) request = request.eq('topic_id', query.topicId);
  return check(await request.order(query.order), query.table) as Row[];
}

export async function updateRow(db: SupabaseClient, table: string, match: Row, patch: Row): Promise<void> {
  check(await db.from(table).update(patch).match(match).select(), table);
}

export async function insertRow(db: SupabaseClient, table: string, row: Row): Promise<void> {
  check(await db.from(table).insert(row).select(), table);
}

export async function deleteRow(db: SupabaseClient, table: string, match: Row): Promise<void> {
  check(await db.from(table).delete().match(match).select(), table);
}

// ---------- Operations ----------

export interface RunRow {
  readonly id: string;
  readonly started_at: string;
  readonly finished_at: string | null;
  readonly edition_id: string | null;
  readonly trigger: string;
  readonly status: string;
  readonly error: string | null;
  readonly stats: Record<string, unknown>;
}

export async function fetchRuns(db: SupabaseClient, topicId: string): Promise<RunRow[]> {
  return check(
    await db.from('crawl_runs').select('id, started_at, finished_at, edition_id, trigger, status, error, stats')
      .eq('topic_id', topicId).order('started_at', { ascending: false }).limit(15),
    'crawl_runs',
  ) as RunRow[];
}

export interface ProviderUsage {
  readonly providerId: string;
  readonly model: string;
  readonly role: string;
  readonly requests: number;
  readonly tokens: number;
  readonly requestLimit: number;
  readonly tokenLimit: number | null;
}

/** Today's (UTC) usage per provider, summed over topics, next to its free limits. */
export async function fetchAiUsageToday(db: SupabaseClient, now = new Date()): Promise<ProviderUsage[]> {
  const today = now.toISOString().slice(0, 10);
  const [providers, usage] = await Promise.all([
    db.from('ai_providers').select('id, model, role, daily_request_limit, daily_token_limit').order('role').order('priority'),
    db.from('ai_usage').select('provider_id, requests, tokens_in, tokens_out').eq('usage_date', today),
  ]);
  const usageRows = check(usage, 'ai_usage') as { provider_id: string; requests: number; tokens_in: number; tokens_out: number }[];
  return (check(providers, 'ai_providers') as { id: string; model: string; role: string; daily_request_limit: number; daily_token_limit: number | null }[])
    .map((p) => {
      const rows = usageRows.filter((u) => u.provider_id === p.id);
      return {
        providerId: p.id, model: p.model, role: p.role,
        requests: rows.reduce((s, r) => s + r.requests, 0),
        tokens: rows.reduce((s, r) => s + r.tokens_in + r.tokens_out, 0),
        requestLimit: p.daily_request_limit, tokenLimit: p.daily_token_limit,
      };
    });
}

export async function fetchQuotaToday(db: SupabaseClient, topicId: string, now = new Date()): Promise<Record<string, number>> {
  const rows = check(
    await db.from('action_quota').select('action, count').eq('topic_id', topicId).eq('usage_date', now.toISOString().slice(0, 10)),
    'action_quota',
  ) as { action: string; count: number }[];
  return Object.fromEntries(rows.map((r) => [r.action, r.count]));
}

export interface DispatchRow {
  readonly id: number;
  readonly edition_id: string;
  readonly local_date: string;
  readonly dispatched_at: string;
}

export async function fetchDispatches(db: SupabaseClient, topicId: string): Promise<DispatchRow[]> {
  return check(
    await db.from('schedule_dispatches').select('id, edition_id, local_date, dispatched_at').eq('topic_id', topicId)
      .order('dispatched_at', { ascending: false }).limit(8),
    'schedule_dispatches',
  ) as DispatchRow[];
}
