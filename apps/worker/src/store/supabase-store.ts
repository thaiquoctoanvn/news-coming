import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ClusterHead, NewArticle, SourceCountUpdate, SourceKind, TopicConfig } from '../types.ts';
import type { RunFinish, RunStart, SourceStatus, Store } from './store.ts';

// Hash lists go into the query string; keep each request well under URL length limits.
const HASH_CHUNK = 100;
const INSERT_CHUNK = 500;

interface SourceRow {
  id: string;
  name: string;
  kind: SourceKind;
  url: string | null;
  query: string | null;
  default_category_id: string | null;
  default_entity_id: string | null;
  authority: number;
}

interface CategoryRow {
  id: string;
  keywords: string[];
  exclude_keywords: string[];
  position: number;
}

interface EntityRow {
  id: string;
  aliases: string[];
  position: number;
}

interface HeadRow {
  id: string;
  cluster_key: string;
  title: string;
  source_id: string | null;
  source_name: string;
  source_count: number;
}

export function createSupabaseStore(url: string, serviceRoleKey: string): Store {
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return new SupabaseStore(db);
}

class SupabaseStore implements Store {
  private readonly db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.db = db;
  }

  async listEnabledTopicIds(): Promise<string[]> {
    const { data, error } = await this.db.from('topics').select('id').eq('enabled', true).order('position');
    if (error) throw new Error(`load topics: ${error.message}`);
    return (data as { id: string }[]).map((row) => row.id);
  }

  async loadTopicConfig(topicId: string): Promise<TopicConfig | null> {
    const topic = await this.db.from('topics').select('id, settings').eq('id', topicId).eq('enabled', true).maybeSingle();
    if (topic.error) throw new Error(`load topic: ${topic.error.message}`);
    if (!topic.data) return null;

    const [sources, categories, entities] = await Promise.all([
      this.db.from('sources')
        .select('id, name, kind, url, query, default_category_id, default_entity_id, authority')
        .eq('topic_id', topicId).eq('enabled', true),
      this.db.from('categories').select('id, keywords, exclude_keywords, position').eq('topic_id', topicId).eq('enabled', true),
      this.db.from('entities').select('id, aliases, position').eq('topic_id', topicId).eq('enabled', true),
    ]);
    for (const result of [sources, categories, entities]) {
      if (result.error) throw new Error(`load topic config: ${result.error.message}`);
    }

    const settings = (topic.data as { settings: { exclude_keywords?: unknown } }).settings;
    return {
      id: topicId,
      excludeKeywords: stringArray(settings.exclude_keywords),
      sources: (sources.data as SourceRow[]).map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        url: row.url,
        query: row.query,
        defaultCategoryId: row.default_category_id,
        defaultEntityId: row.default_entity_id,
        authority: row.authority,
      })),
      categories: (categories.data as CategoryRow[]).map((row) => ({
        id: row.id,
        keywords: row.keywords,
        excludeKeywords: row.exclude_keywords,
        position: row.position,
      })),
      entities: (entities.data as EntityRow[]).map((row) => ({ id: row.id, aliases: row.aliases, position: row.position })),
    };
  }

  async findExistingHashes(topicId: string, hashes: readonly string[]): Promise<Set<string>> {
    const existing = new Set<string>();
    for (let i = 0; i < hashes.length; i += HASH_CHUNK) {
      const chunk = hashes.slice(i, i + HASH_CHUNK);
      const { data, error } = await this.db.from('articles').select('url_hash').eq('topic_id', topicId).in('url_hash', chunk);
      if (error) throw new Error(`find existing hashes: ${error.message}`);
      for (const row of data as { url_hash: string }[]) existing.add(row.url_hash);
    }
    return existing;
  }

  async loadClusterHeads(topicId: string, since: Date): Promise<ClusterHead[]> {
    const { data, error } = await this.db
      .from('articles')
      .select('id, cluster_key, title, source_id, source_name, source_count')
      .eq('topic_id', topicId)
      .not('status', 'in', '(filtered_out,duplicate)')
      .not('cluster_key', 'is', null)
      .gte('fetched_at', since.toISOString())
      // Supabase caps responses at 1000 rows; keep the newest stories if the window is larger.
      .order('fetched_at', { ascending: false })
      .limit(1000);
    if (error) throw new Error(`load cluster heads: ${error.message}`);
    return (data as HeadRow[]).map((row) => ({
      id: row.id,
      clusterKey: row.cluster_key,
      title: row.title,
      sourceId: row.source_id,
      sourceName: row.source_name,
      sourceCount: row.source_count,
    }));
  }

  async insertArticles(articles: readonly NewArticle[]): Promise<number> {
    let inserted = 0;
    for (let i = 0; i < articles.length; i += INSERT_CHUNK) {
      const rows = articles.slice(i, i + INSERT_CHUNK).map(toArticleRow);
      const { data, error } = await this.db
        .from('articles')
        .upsert(rows, { onConflict: 'topic_id,url_hash', ignoreDuplicates: true })
        .select('id');
      if (error) throw new Error(`insert articles: ${error.message}`);
      inserted += data.length;
    }
    return inserted;
  }

  async updateSourceCounts(updates: readonly SourceCountUpdate[]): Promise<void> {
    for (const update of updates) {
      const { error } = await this.db.from('articles').update({ source_count: update.sourceCount }).eq('id', update.articleId);
      if (error) throw new Error(`update source count: ${error.message}`);
    }
  }

  async updateSourceStatus(sourceId: string, status: SourceStatus): Promise<void> {
    const { error } = await this.db
      .from('sources')
      .update({ last_fetched_at: status.fetchedAt.toISOString(), last_error: status.error })
      .eq('id', sourceId);
    if (error) throw new Error(`update source status: ${error.message}`);
  }

  async startRun(run: RunStart): Promise<string> {
    const { data, error } = await this.db
      .from('crawl_runs')
      .insert({ topic_id: run.topicId, edition_id: run.editionId, trigger: run.trigger })
      .select('id')
      .single();
    if (error) throw new Error(`start run: ${error.message}`);
    return (data as { id: string }).id;
  }

  async finishRun(runId: string, result: RunFinish): Promise<void> {
    const { error } = await this.db
      .from('crawl_runs')
      .update({ status: result.status, stats: result.stats, error: result.error, finished_at: new Date().toISOString() })
      .eq('id', runId);
    if (error) throw new Error(`finish run: ${error.message}`);
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function toArticleRow(article: NewArticle): Record<string, unknown> {
  return {
    topic_id: article.topicId,
    source_id: article.sourceId,
    source_name: article.sourceName,
    url: article.url,
    url_hash: article.urlHash,
    cluster_key: article.clusterKey,
    title: article.title,
    description: article.description,
    published_at: article.publishedAt?.toISOString() ?? null,
    status: article.status,
    category_id: article.categoryId,
    entity_id: article.entityId,
    authority: article.authority,
    source_count: article.sourceCount,
  };
}
