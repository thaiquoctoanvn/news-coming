// Article rows as read and patched by the edition pipeline (worker and Edge Functions).

export type NewArticleStatus = 'raw' | 'filtered_out' | 'duplicate';
export type ArticleStatus = NewArticleStatus | 'scored' | 'selected' | 'summarized' | 'translated' | 'failed';

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
