import type { AiProvider } from '../ai/providers.ts';
import type { UsageStore } from '../ai/router.ts';
import type { PromptRef } from '../prompts.ts';
import type { PinRule, SelectedItem, SlotConfig } from '../selection.ts';
import type { ArticlePatch, ArticleRow, ArticleStatus } from './types.ts';

export interface EditionConfig {
  readonly topic: {
    readonly id: string;
    readonly name: string;
    readonly scoringGuide: string;
    readonly aiDailyRequestCap: number;
    readonly pin: PinRule | null;
    /** Target English summary length (topics.settings.summary_words). */
    readonly summaryWords: number;
    /** Items added per "Xem thêm" press / per "Cập nhật tin mới" run. */
    readonly moreBatchSize: number;
    readonly refreshSize: number;
    /** Daily caps of the admin buttons. */
    readonly dailyCapMore: number;
    readonly dailyCapRefresh: number;
  };
  readonly edition: {
    readonly id: string;
    readonly timezone: string;
    readonly sizeMax: number;
    /** Refresh data modules (prices, yields, calendar) before collecting news. */
    readonly runModules: boolean;
  };
  readonly slots: readonly SlotConfig[];
  readonly categories: readonly PromptRef[];
  readonly entities: readonly PromptRef[];
  readonly modules: readonly PromptRef[];
}

export interface ArticleQuery {
  readonly statuses: readonly ArticleStatus[];
  readonly fetchedSince?: Date;
}

export interface DigestInfo {
  readonly id: string;
  readonly topicId: string;
  readonly editionId: string;
  readonly digestDate: string;
  readonly windowStart: Date;
  readonly windowEnd: Date;
}

export interface DigestItemInfo {
  readonly articleId: string;
  readonly position: number;
  readonly storyKey: string | null;
}

export type AddedBy = 'auto' | 'more' | 'refresh';

export interface NewDigest {
  readonly topicId: string;
  readonly editionId: string;
  readonly digestDate: string;
  readonly windowStart: Date;
  readonly windowEnd: Date;
}

/** Persistence used by the edition pipeline (scoring, selection, summaries, translation). */
export interface EditionStore extends UsageStore {
  /** Config of an enabled edition of an enabled topic; null otherwise. */
  loadEditionConfig(topicId: string, editionId: string): Promise<EditionConfig | null>;
  loadAiProviders(): Promise<AiProvider[]>;
  lastDigestWindowEnd(topicId: string): Promise<Date | null>;
  findDigestId(topicId: string, editionId: string, digestDate: string): Promise<string | null>;
  createDigest(digest: NewDigest): Promise<string>;
  addDigestItems(digestId: string, items: readonly SelectedItem[], addedBy?: AddedBy): Promise<void>;
  loadDigest(digestId: string): Promise<DigestInfo | null>;
  loadDigestItems(digestId: string): Promise<DigestItemInfo[]>;
  updateDigestWindowEnd(digestId: string, windowEnd: Date): Promise<void>;
  loadArticles(topicId: string, query: ArticleQuery): Promise<ArticleRow[]>;
  updateArticle(id: string, patch: ArticlePatch): Promise<void>;
  /** Editions whose local time has come and that have not run today (scheduler backup). */
  loadDueEditions(): Promise<{ topicId: string; editionId: string }[]>;
  /** Other outlets' articles about the same story (to replace an unreadable one as a whole). */
  loadClusterMembers(topicId: string, clusterKey: string, excludeId: string): Promise<ArticleRow[]>;
}
