import { randomUUID } from 'node:crypto';
import type { ClusterHead, NewArticle, SourceCountUpdate, TopicConfig } from '../types.ts';
import type { RunFinish, RunStart, SourceStatus, Store } from './store.ts';

export interface StoredArticle extends NewArticle {
  readonly id: string;
  readonly fetchedAt: Date;
}

export interface StoredRun extends RunStart {
  readonly id: string;
  readonly finish: RunFinish | null;
}

/** In-memory Store for tests and local dry runs. */
export class MemoryStore implements Store {
  articles: StoredArticle[] = [];
  runs: StoredRun[] = [];
  sourceStatus = new Map<string, SourceStatus>();
  private readonly topics: ReadonlyMap<string, TopicConfig>;

  constructor(topics: readonly TopicConfig[]) {
    this.topics = new Map(topics.map((topic) => [topic.id, topic]));
  }

  async listEnabledTopicIds(): Promise<string[]> {
    return [...this.topics.keys()];
  }

  async loadTopicConfig(topicId: string): Promise<TopicConfig | null> {
    return this.topics.get(topicId) ?? null;
  }

  async findExistingHashes(topicId: string, hashes: readonly string[]): Promise<Set<string>> {
    const stored = new Set(this.articles.filter((a) => a.topicId === topicId).map((a) => a.urlHash));
    return new Set(hashes.filter((hash) => stored.has(hash)));
  }

  async loadClusterHeads(topicId: string, since: Date): Promise<ClusterHead[]> {
    return this.articles
      .filter((a) => a.topicId === topicId && a.status === 'raw' && a.clusterKey !== null && a.fetchedAt >= since)
      .map((a) => ({
        id: a.id,
        clusterKey: a.clusterKey ?? '',
        title: a.title,
        sourceId: a.sourceId,
        sourceName: a.sourceName,
        sourceCount: a.sourceCount,
      }));
  }

  async insertArticles(articles: readonly NewArticle[]): Promise<number> {
    const existing = new Set(this.articles.map((a) => `${a.topicId}|${a.urlHash}`));
    const fresh = articles.filter((a) => !existing.has(`${a.topicId}|${a.urlHash}`));
    this.articles = [
      ...this.articles,
      ...fresh.map((a) => ({ ...a, id: randomUUID(), fetchedAt: new Date() })),
    ];
    return fresh.length;
  }

  async updateSourceCounts(updates: readonly SourceCountUpdate[]): Promise<void> {
    const counts = new Map(updates.map((u) => [u.articleId, u.sourceCount]));
    this.articles = this.articles.map((a) => (counts.has(a.id) ? { ...a, sourceCount: counts.get(a.id) ?? a.sourceCount } : a));
  }

  async updateSourceStatus(sourceId: string, status: SourceStatus): Promise<void> {
    this.sourceStatus.set(sourceId, status);
  }

  async startRun(run: RunStart): Promise<string> {
    const id = randomUUID();
    this.runs = [...this.runs, { ...run, id, finish: null }];
    return id;
  }

  async finishRun(runId: string, result: RunFinish): Promise<void> {
    this.runs = this.runs.map((r) => (r.id === runId ? { ...r, finish: result } : r));
  }
}
