import type { SupabaseClient } from '@supabase/supabase-js';
import type { CalendarEvent, DigestArticle, DigestSummary, Direction, Edition, MarketPoint, Topic } from './types.ts';

// Read-only queries for the public site. Column lists match the anon grants
// (supabase/migrations/*_security.sql); RLS hides disabled topics and untranslated articles.

const ARTICLE_COLUMNS = 'id, source_name, url, original_url, published_at, category_id, impact, direction, title_vi, summary_vi';
const DIGEST_HISTORY = 30;
const EVENTS_LIMIT = 100;
const DAY_MS = 86_400_000;

function check<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data as T;
}

export async function fetchTopics(db: SupabaseClient): Promise<Topic[]> {
  const rows = check(await db.from('topics').select('id, name_vi, description_vi').order('position'), 'topics');
  return (rows as { id: string; name_vi: string; description_vi: string | null }[])
    .map((r) => ({ id: r.id, name: r.name_vi, description: r.description_vi }));
}

export async function fetchEditions(db: SupabaseClient, topicId: string): Promise<Edition[]> {
  const rows = check(await db.from('editions').select('id, name_vi, timezone, local_time').eq('topic_id', topicId), 'editions');
  return (rows as { id: string; name_vi: string; timezone: string; local_time: string }[])
    .map((r) => ({ id: r.id, name: r.name_vi, timezone: r.timezone, localTime: r.local_time.slice(0, 5) }));
}

export async function fetchDigests(db: SupabaseClient, topicId: string): Promise<DigestSummary[]> {
  const rows = check(
    await db.from('digests').select('id, edition_id, digest_date').eq('topic_id', topicId)
      .order('digest_date', { ascending: false }).order('created_at', { ascending: false }).limit(DIGEST_HISTORY),
    'digests',
  );
  return (rows as { id: string; edition_id: string; digest_date: string }[])
    .map((r) => ({ id: r.id, editionId: r.edition_id, date: r.digest_date }));
}

interface ItemRow {
  position: number;
  slot_id: string | null;
  is_pinned: boolean;
  articles: {
    id: string; source_name: string; url: string; original_url: string | null; published_at: string | null;
    category_id: string | null; impact: number | null; direction: Direction | null; title_vi: string | null; summary_vi: string | null;
  } | null;
}

/** Published items of a digest, in order. Items whose article is not public (not translated, rejected) are skipped. */
export async function fetchDigestArticles(db: SupabaseClient, digestId: string): Promise<DigestArticle[]> {
  const rows = check(
    await db.from('digest_items').select(`position, slot_id, is_pinned, articles(${ARTICLE_COLUMNS})`)
      .eq('digest_id', digestId).order('position'),
    'digest items',
  ) as unknown as ItemRow[];
  return rows.flatMap((row) => {
    const a = row.articles;
    if (!a?.title_vi || !a.summary_vi) return [];
    return [{
      id: a.id, position: row.position, slotId: row.slot_id, isPinned: row.is_pinned, sourceName: a.source_name,
      url: a.original_url ?? a.url, publishedAt: a.published_at, categoryId: a.category_id, impact: a.impact,
      direction: a.direction, title: a.title_vi, summary: a.summary_vi,
    }];
  });
}

export async function fetchCategories(db: SupabaseClient, topicId: string): Promise<Map<string, string>> {
  const rows = check(await db.from('categories').select('id, name_vi').eq('topic_id', topicId), 'categories');
  return new Map((rows as { id: string; name_vi: string }[]).map((r) => [r.id, r.name_vi]));
}

// Supabase returns at most 1000 rows per request; a year of 8 daily series is ~2000, so read in pages.
const PAGE_SIZE = 1000;

async function fetchMarketRows(db: SupabaseClient, topicId: string, since: string, seriesIds?: readonly string[]): Promise<MarketPoint[]> {
  const rows: { series: string; obs_date: string; value: number | string }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let request = db.from('market_data').select('series, obs_date, value').eq('topic_id', topicId).gte('obs_date', since);
    if (seriesIds) request = request.in('series', [...seriesIds]);
    const page = check(await request.order('obs_date').order('series').range(from, from + PAGE_SIZE - 1), 'market data') as typeof rows;
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows.map((r) => ({ series: r.series, date: r.obs_date, value: Number(r.value) }));
}

export function fetchMarketData(db: SupabaseClient, topicId: string, days: number, now = Date.now()): Promise<MarketPoint[]> {
  return fetchMarketRows(db, topicId, new Date(now - days * DAY_MS).toISOString().slice(0, 10));
}

/** Only the given series (monthly macro data) over the last `months` months. */
export function fetchMarketSeries(db: SupabaseClient, topicId: string, seriesIds: readonly string[], months: number, now = Date.now()): Promise<MarketPoint[]> {
  const since = new Date(now - (months + 1) * 31 * DAY_MS).toISOString().slice(0, 7);
  return fetchMarketRows(db, topicId, `${since}-01`, seriesIds);
}

/** Days (YYYY-MM-DD) that have a digest in the last year, newest first — for the date picker. */
export async function fetchDigestDates(db: SupabaseClient, topicId: string, now = Date.now()): Promise<string[]> {
  const since = new Date(now - 366 * DAY_MS).toISOString().slice(0, 10);
  const rows = check(
    await db.from('digests').select('digest_date').eq('topic_id', topicId).gte('digest_date', since)
      .order('digest_date', { ascending: false }).limit(PAGE_SIZE),
    'digest dates',
  ) as { digest_date: string }[];
  return [...new Set(rows.map((r) => r.digest_date))];
}

export async function fetchEvents(db: SupabaseClient, topicId: string, now = Date.now()): Promise<CalendarEvent[]> {
  const rows = check(
    await db.from('events').select('id, kind, title_vi, title, starts_at, importance, source_url').eq('topic_id', topicId)
      .gte('starts_at', new Date(now - DAY_MS).toISOString()).order('starts_at').limit(EVENTS_LIMIT),
    'events',
  );
  return (rows as { id: string; kind: string; title_vi: string | null; title: string; starts_at: string; importance: number; source_url: string | null }[])
    .map((r) => ({ id: r.id, kind: r.kind, title: r.title_vi ?? r.title, startsAt: r.starts_at, importance: r.importance, sourceUrl: r.source_url }));
}
