import type { AiProvider, PinRule, PromptRef, SelectedItem, SlotConfig, UsageStore } from '../shared.ts';
import type { ArticlePatch, ArticleRow, ArticleStatus } from '../types.ts';

export interface EditionConfig {
  readonly topic: {
    readonly id: string;
    readonly name: string;
    readonly scoringGuide: string;
    readonly aiDailyRequestCap: number;
    readonly pin: PinRule | null;
    /** Target English summary length (topics.settings.summary_words). */
    readonly summaryWords: number;
  };
  readonly edition: {
    readonly id: string;
    readonly timezone: string;
    readonly sizeMax: number;
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
  addDigestItems(digestId: string, items: readonly SelectedItem[]): Promise<void>;
  loadArticles(topicId: string, query: ArticleQuery): Promise<ArticleRow[]>;
  updateArticle(id: string, patch: ArticlePatch): Promise<void>;
  /** Other outlets' articles about the same story (to replace an unreadable one as a whole). */
  loadClusterMembers(topicId: string, clusterKey: string, excludeId: string): Promise<ArticleRow[]>;
}
