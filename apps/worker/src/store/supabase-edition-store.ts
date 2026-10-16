import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AiProvider, Direction, PinRule, SelectedItem, SlotConfig, SlotKind, UsageTotals } from '../shared.ts';
import type { ArticlePatch, ArticleRow, ArticleStatus } from '../types.ts';
import type { ArticleQuery, EditionConfig, EditionStore, NewDigest } from './edition-store.ts';

const ARTICLE_COLUMNS = [
  'id', 'topic_id', 'url', 'source_name', 'title', 'description', 'status', 'category_id', 'entity_id', 'authority',
  'source_count', 'cluster_key', 'published_at', 'fetched_at', 'impact', 'direction', 'explains', 'final_score', 'story_key',
  'content_snippet', 'summary_en',
].join(', ');
const PAGE_SIZE = 1000;
const DEFAULT_SUMMARY_WORDS = 350;
const MAX_CLUSTER_MEMBERS = 5;

interface ArticleDbRow {
  id: string; topic_id: string; url: string; source_name: string; title: string; description: string | null;
  status: ArticleStatus; category_id: string | null; entity_id: string | null; authority: number; source_count: number;
  cluster_key: string | null; published_at: string | null; fetched_at: string; impact: number | null;
  direction: Direction | null; explains: string | null; final_score: number | null; story_key: string | null;
  content_snippet: string | null; summary_en: string | null;
}

interface SlotDbRow {
  id: string; position: number; kind: SlotKind; category_ids: string[]; entity_ids: string[]; max_items: number;
  min_score: number; extra_item_min_score: number | null; attach_modules: string[];
}

interface ProviderDbRow {
  id: string; role: AiProvider['role']; provider: AiProvider['provider']; model: string; priority: number;
  daily_request_limit: number; daily_token_limit: number | null; rpm_limit: number; tpm_limit: number | null;
  request_options: Record<string, unknown>;
}

export function createSupabaseEditionStore(url: string, serviceRoleKey: string): EditionStore {
  return new SupabaseEditionStore(createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }));
}

class SupabaseEditionStore implements EditionStore {
  private readonly db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.db = db;
  }

  async loadEditionConfig(topicId: string, editionId: string): Promise<EditionConfig | null> {
    const [topic, edition, slots, categories, entities, modules] = await Promise.all([
      this.db.from('topics').select('id, name_vi, scoring_guide, ai_daily_request_cap, settings').eq('id', topicId).eq('enabled', true).maybeSingle(),
      this.db.from('editions').select('id, timezone, size_max, run_modules').eq('topic_id', topicId).eq('id', editionId).eq('enabled', true).maybeSingle(),
      this.db.from('digest_slots').select('*').eq('topic_id', topicId).eq('enabled', true),
      this.db.from('categories').select('id, name_vi, description_en').eq('topic_id', topicId).eq('enabled', true).order('position'),
      this.db.from('entities').select('id, name').eq('topic_id', topicId).eq('enabled', true).order('position'),
      this.db.from('data_modules').select('id, name_vi').eq('topic_id', topicId).eq('enabled', true),
    ]);
    for (const result of [topic, edition, slots, categories, entities, modules]) {
      if (result.error) throw new Error(`load edition config: ${result.error.message}`);
    }
    if (!topic.data || !edition.data) return null;

    const t = topic.data as { id: string; name_vi: string; scoring_guide: string; ai_daily_request_cap: number; settings: { pin?: { min_impact?: number; direction?: Direction; max?: number }; summary_words?: number } };
    const e = edition.data as { id: string; timezone: string; size_max: number; run_modules: boolean };
    const pin = t.settings.pin;
    return {
      topic: {
        id: t.id,
        name: t.name_vi,
        scoringGuide: t.scoring_guide,
        aiDailyRequestCap: t.ai_daily_request_cap,
        pin: pin?.min_impact !== undefined ? { minImpact: pin.min_impact, direction: pin.direction ?? 'negative', max: pin.max ?? 3 } satisfies PinRule : null,
        summaryWords: t.settings.summary_words ?? DEFAULT_SUMMARY_WORDS,
      },
      edition: { id: e.id, timezone: e.timezone, sizeMax: e.size_max, runModules: e.run_modules },
      slots: (slots.data as SlotDbRow[]).map((s): SlotConfig => ({
        id: s.id, position: s.position, kind: s.kind, categoryIds: s.category_ids, entityIds: s.entity_ids, maxItems: s.max_items,
        minScore: s.min_score, extraItemMinScore: s.extra_item_min_score, attachModules: s.attach_modules,
      })),
      categories: (categories.data as { id: string; name_vi: string; description_en: string | null }[])
        .map((c) => ({ id: c.id, name: c.name_vi, description: c.description_en })),
      entities: (entities.data as { id: string; name: string }[]).map((c) => ({ id: c.id, name: c.name })),
      modules: (modules.data as { id: string; name_vi: string }[]).map((c) => ({ id: c.id, name: c.name_vi })),
    };
  }

  async loadAiProviders(): Promise<AiProvider[]> {
    const { data, error } = await this.db.from('ai_providers').select('*').eq('enabled', true);
    if (error) throw new Error(`load ai providers: ${error.message}`);
    return (data as ProviderDbRow[]).map((p) => ({
      id: p.id, role: p.role, provider: p.provider, model: p.model, priority: p.priority,
      dailyRequestLimit: p.daily_request_limit, dailyTokenLimit: p.daily_token_limit, rpmLimit: p.rpm_limit,
      tpmLimit: p.tpm_limit, requestOptions: p.request_options,
    }));
  }

  async loadProviderUsage(date: string): Promise<Map<string, UsageTotals>> {
    const { data, error } = await this.db.from('ai_usage').select('provider_id, requests, tokens_in, tokens_out').eq('usage_date', date);
    if (error) throw new Error(`load ai usage: ${error.message}`);
    const totals = new Map<string, UsageTotals>();
    for (const row of data as { provider_id: string; requests: number; tokens_in: number; tokens_out: number }[]) {
      const prev = totals.get(row.provider_id) ?? { requests: 0, tokens: 0 };
      totals.set(row.provider_id, { requests: prev.requests + row.requests, tokens: prev.tokens + row.tokens_in + row.tokens_out });
    }
    return totals;
  }

  async loadTopicRequests(topicId: string, date: string): Promise<number> {
    const { data, error } = await this.db.from('ai_usage').select('requests').eq('topic_id', topicId).eq('usage_date', date);
    if (error) throw new Error(`load topic ai usage: ${error.message}`);
    return (data as { requests: number }[]).reduce((sum, row) => sum + row.requests, 0);
  }

  async recordUsage(providerId: string, topicId: string, date: string, tokensIn: number, tokensOut: number): Promise<void> {
    const { error } = await this.db.rpc('record_ai_usage', {
      p_provider_id: providerId, p_topic_id: topicId, p_usage_date: date, p_tokens_in: tokensIn, p_tokens_out: tokensOut,
    });
    if (error) throw new Error(`record ai usage: ${error.message}`);
  }

  async lastDigestWindowEnd(topicId: string): Promise<Date | null> {
    const { data, error } = await this.db.from('digests').select('window_end').eq('topic_id', topicId)
      .order('window_end', { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(`last digest: ${error.message}`);
    return data ? new Date((data as { window_end: string }).window_end) : null;
  }

  async findDigestId(topicId: string, editionId: string, digestDate: string): Promise<string | null> {
    const { data, error } = await this.db.from('digests').select('id')
      .eq('topic_id', topicId).eq('edition_id', editionId).eq('digest_date', digestDate).maybeSingle();
    if (error) throw new Error(`find digest: ${error.message}`);
    return data ? (data as { id: string }).id : null;
  }

  async createDigest(digest: NewDigest): Promise<string> {
    const { data, error } = await this.db.from('digests').insert({
      topic_id: digest.topicId, edition_id: digest.editionId, digest_date: digest.digestDate,
      window_start: digest.windowStart.toISOString(), window_end: digest.windowEnd.toISOString(),
    }).select('id').single();
    if (error) throw new Error(`create digest: ${error.message}`);
    return (data as { id: string }).id;
  }

  async addDigestItems(digestId: string, items: readonly SelectedItem[]): Promise<void> {
    if (items.length === 0) return;
    const { error } = await this.db.from('digest_items').insert(items.map((item) => ({
      digest_id: digestId, article_id: item.articleId, position: item.position, slot_id: item.slotId, is_pinned: item.isPinned,
    })));
    if (error) throw new Error(`add digest items: ${error.message}`);
  }

  async loadArticles(topicId: string, query: ArticleQuery): Promise<ArticleRow[]> {
    const rows: ArticleDbRow[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      let request = this.db.from('articles').select(ARTICLE_COLUMNS).eq('topic_id', topicId).in('status', [...query.statuses]);
      if (query.fetchedSince) request = request.gte('fetched_at', query.fetchedSince.toISOString());
      const { data, error } = await request.order('fetched_at').range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(`load articles: ${error.message}`);
      rows.push(...(data as unknown as ArticleDbRow[]));
      if (data.length < PAGE_SIZE) break;
    }
    return rows.map(toArticleRow);
  }

  async updateArticle(id: string, patch: ArticlePatch): Promise<void> {
    const { error } = await this.db.from('articles').update(toPatchRow(patch)).eq('id', id);
    if (error) throw new Error(`update article: ${error.message}`);
  }

  async loadDueEditions(): Promise<{ topicId: string; editionId: string }[]> {
    const { data, error } = await this.db.rpc('due_editions');
    if (error) throw new Error(`load due editions: ${error.message}`);
    return (data as { topic_id: string; edition_id: string }[]).map((r) => ({ topicId: r.topic_id, editionId: r.edition_id }));
  }

  async loadClusterMembers(topicId: string, clusterKey: string, excludeId: string): Promise<ArticleRow[]> {
    const { data, error } = await this.db.from('articles').select(ARTICLE_COLUMNS).eq('topic_id', topicId)
      .eq('cluster_key', clusterKey).neq('id', excludeId).order('authority', { ascending: false }).limit(MAX_CLUSTER_MEMBERS);
    if (error) throw new Error(`load cluster members: ${error.message}`);
    return (data as unknown as ArticleDbRow[]).map(toArticleRow);
  }
}

function toArticleRow(r: ArticleDbRow): ArticleRow {
  return {
    id: r.id, topicId: r.topic_id, url: r.url, sourceName: r.source_name, title: r.title, description: r.description,
    status: r.status, categoryId: r.category_id, entityId: r.entity_id, authority: r.authority, sourceCount: r.source_count,
    clusterKey: r.cluster_key, publishedAt: r.published_at ? new Date(r.published_at) : null, fetchedAt: new Date(r.fetched_at),
    impact: r.impact, direction: r.direction, explains: r.explains, finalScore: r.final_score, storyKey: r.story_key,
    contentSnippet: r.content_snippet, summaryEn: r.summary_en,
  };
}

const PATCH_COLUMNS: Record<keyof ArticlePatch, string> = {
  status: 'status', categoryId: 'category_id', entityId: 'entity_id', impact: 'impact', direction: 'direction',
  explains: 'explains', aiReason: 'ai_reason', finalScore: 'final_score', storyKey: 'story_key', scoredAt: 'scored_at',
  contentSnippet: 'content_snippet', originalUrl: 'original_url', summaryEn: 'summary_en', titleVi: 'title_vi',
  summaryVi: 'summary_vi', translatedAt: 'translated_at', error: 'error',
};

function toPatchRow(patch: ArticlePatch): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(patch).map(([key, value]) => [
      PATCH_COLUMNS[key as keyof ArticlePatch],
      value instanceof Date ? value.toISOString() : value,
    ]),
  );
}
