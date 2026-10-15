import type { AiProvider, PinRule, SelectedItem, SlotConfig, UsageStore } from '../shared.ts';
import type { ArticlePatch, ArticleRow, ArticleStatus } from '../types.ts';

export interface NamedRef {
  readonly id: string;
  readonly name: string;
}

export interface EditionConfig {
  readonly topic: {
    readonly id: string;
    readonly name: string;
    readonly scoringGuide: string;
    readonly aiDailyRequestCap: number;
    readonly pin: PinRule | null;
  };
  readonly edition: {
    readonly id: string;
    readonly timezone: string;
    readonly sizeMax: number;
  };
  readonly slots: readonly SlotConfig[];
  readonly categories: readonly NamedRef[];
  readonly entities: readonly NamedRef[];
  readonly modules: readonly NamedRef[];
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
  /** URLs of other outlets reporting the same story, for when the main one is paywalled. */
  loadClusterUrls(topicId: string, clusterKey: string, excludeId: string): Promise<string[]>;
}
