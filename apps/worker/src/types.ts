export type SourceKind = 'rss' | 'google_news' | 'edgar' | 'gdelt' | 'html' | 'json';
export type NewArticleStatus = 'raw' | 'filtered_out' | 'duplicate';
export type ArticleStatus = NewArticleStatus | 'scored' | 'selected' | 'summarized' | 'translated' | 'failed';
export type RunTrigger = 'schedule' | 'manual' | 'backup';
export type RunStatus = 'success' | 'partial' | 'failed';

export interface Source {
  readonly id: string;
  readonly name: string;
  readonly kind: SourceKind;
  readonly url: string | null;
  readonly query: string | null;
  readonly defaultCategoryId: string | null;
  readonly defaultEntityId: string | null;
  readonly authority: number;
}

export interface Category {
  readonly id: string;
  readonly keywords: readonly string[];
  readonly excludeKeywords: readonly string[];
  readonly position: number;
}

export interface Entity {
  readonly id: string;
  readonly aliases: readonly string[];
  readonly position: number;
}

/** Enabled parts of one enabled topic. */
export interface TopicConfig {
  readonly id: string;
  /** Topic-wide noise keywords: a match drops the item regardless of category. */
  readonly excludeKeywords: readonly string[];
  readonly sources: readonly Source[];
  readonly categories: readonly Category[];
  readonly entities: readonly Entity[];
}

/** One item as returned by a source, before normalization. */
export interface RawItem {
  readonly url: string;
  readonly title: string;
  readonly description?: string;
  readonly publishedAt?: Date;
  /** Original publisher when the source is an aggregator (e.g. "Reuters" in Google News). */
  readonly publisher?: string;
  readonly publisherDomain?: string;
}

/** Most recent article of each story cluster, used to detect duplicates across runs. */
export interface ClusterHead {
  readonly id: string;
  readonly clusterKey: string;
  readonly title: string;
  readonly sourceId: string | null;
  readonly sourceName: string;
  readonly sourceCount: number;
}

export interface NewArticle {
  readonly topicId: string;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly url: string;
  readonly urlHash: string;
  readonly clusterKey: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly publishedAt: Date | null;
  readonly status: NewArticleStatus;
  readonly categoryId: string | null;
  readonly entityId: string | null;
  readonly authority: number;
  /** Number of outlets reporting this story (1 + duplicates found in the same run). */
  readonly sourceCount: number;
}

export interface SourceCountUpdate {
  readonly articleId: string;
  readonly sourceCount: number;
}

export interface CollectStats {
  readonly fetched: number;
  readonly tooOld: number;
  readonly alreadyStored: number;
  readonly filteredOut: number;
  readonly duplicates: number;
  /** New articles waiting for AI scoring (status 'raw'). */
  readonly inserted: number;
  readonly sourceErrors: readonly { readonly source: string; readonly error: string }[];
}

/** Stored article as read by the edition pipeline. */
export interface ArticleRow {
  readonly id: string;
  readonly topicId: string;
  readonly url: string;
  readonly sourceName: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: ArticleStatus;
  readonly categoryId: string | null;
  readonly entityId: string | null;
  readonly authority: number;
  readonly sourceCount: number;
  readonly clusterKey: string | null;
  readonly publishedAt: Date | null;
  readonly fetchedAt: Date;
  readonly impact: number | null;
  readonly direction: 'negative' | 'neutral' | 'positive' | null;
  readonly explains: string | null;
  readonly finalScore: number | null;
  readonly storyKey: string | null;
  readonly contentSnippet: string | null;
  readonly summaryEn: string | null;
}

export interface ArticlePatch {
  readonly status?: ArticleStatus;
  readonly categoryId?: string | null;
  readonly entityId?: string | null;
  readonly impact?: number;
  readonly direction?: 'negative' | 'neutral' | 'positive';
  readonly explains?: string | null;
  readonly aiReason?: string;
  readonly finalScore?: number;
  readonly storyKey?: string | null;
  readonly scoredAt?: Date;
  readonly contentSnippet?: string;
  readonly originalUrl?: string | null;
  readonly summaryEn?: string;
  readonly titleVi?: string;
  readonly summaryVi?: string;
  readonly translatedAt?: Date;
  readonly error?: string | null;
}
