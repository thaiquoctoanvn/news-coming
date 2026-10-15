import type { ClusterHead, NewArticle, RunStatus, RunTrigger, SourceCountUpdate, TopicConfig } from '../types.ts';

export interface RunStart {
  readonly topicId: string;
  readonly editionId: string | null;
  readonly trigger: RunTrigger;
}

export interface RunFinish {
  readonly status: RunStatus;
  /** JSON-serializable run statistics stored in crawl_runs.stats. */
  readonly stats: object;
  readonly error: string | null;
}

export interface SourceStatus {
  readonly fetchedAt: Date;
  readonly error: string | null;
}

/** Persistence used by the collect pipeline (Supabase in production, in-memory in tests). */
export interface Store {
  listEnabledTopicIds(): Promise<string[]>;
  /** Enabled sources/categories/entities of an enabled topic; null when the topic is missing or disabled. */
  loadTopicConfig(topicId: string): Promise<TopicConfig | null>;
  findExistingHashes(topicId: string, hashes: readonly string[]): Promise<Set<string>>;
  /** Cluster representatives (not duplicates, not filtered out) fetched since `since`. */
  loadClusterHeads(topicId: string, since: Date): Promise<ClusterHead[]>;
  insertArticles(articles: readonly NewArticle[]): Promise<number>;
  updateSourceCounts(updates: readonly SourceCountUpdate[]): Promise<void>;
  updateSourceStatus(sourceId: string, status: SourceStatus): Promise<void>;
  startRun(run: RunStart): Promise<string>;
  finishRun(runId: string, result: RunFinish): Promise<void>;
}
