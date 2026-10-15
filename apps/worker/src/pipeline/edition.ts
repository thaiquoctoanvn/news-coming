import { errorMessage, log } from '../log.ts';
import { AiRouter, AiUnavailableError, type ApiKeys, type FetchLike, type SelectionCandidate, selectDigest } from '../shared.ts';
import type { EditionConfig, EditionStore } from '../store/edition-store.ts';
import type { Store } from '../store/store.ts';
import type { ArticleRow, CollectStats, RunStatus, RunTrigger } from '../types.ts';
import { type StepContext, scoreArticles, summarizeArticles, translateArticles } from './ai-steps.ts';
import { type SourceFetcher, collectItems } from './collect.ts';
import { loadArticleContent } from './content-step.ts';

// One edition of a topic (DESIGN.md §4–§5): collect → score → select → content → summarize → translate.
// Unfinished work (quota reached, errors) stays in its status and is resumed by the next run.

const DEFAULT_WINDOW_HOURS = 24;
const HOUR_MS = 3_600_000;

export interface EditionOptions {
  readonly store: Store;
  readonly editionStore: EditionStore;
  readonly topicId: string;
  readonly editionId: string;
  readonly trigger: RunTrigger;
  readonly fetchSource: SourceFetcher;
  readonly keys: ApiKeys;
  readonly fetchImpl?: FetchLike;
  readonly now?: Date;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface EditionStats {
  readonly collect: CollectStats | null;
  readonly scored: number;
  readonly selected: number;
  readonly summarized: number;
  readonly translated: number;
  readonly aiStopped: string | null;
}

export interface EditionResult {
  readonly status: RunStatus | 'skipped';
  readonly stats: EditionStats | null;
}

export async function runEdition(options: EditionOptions): Promise<EditionResult> {
  const { store, editionStore, topicId, editionId } = options;
  const [topicConfig, config] = await Promise.all([
    store.loadTopicConfig(topicId),
    editionStore.loadEditionConfig(topicId, editionId),
  ]);
  if (!topicConfig || !config) {
    log.warn('topic or edition missing or disabled, skipping', { topicId, editionId });
    return { status: 'skipped', stats: null };
  }

  const runId = await store.startRun({ topicId, editionId, trigger: options.trigger });
  try {
    const now = options.now ?? new Date();
    const collect = await collectItems(topicConfig, { store, fetchSource: options.fetchSource, now });
    const stats = await processEdition(config, options, now, collect);
    const status: RunStatus = collect.sourceErrors.length === 0 && stats.aiStopped === null ? 'success' : 'partial';
    await store.finishRun(runId, { status, stats, error: null });
    log.info('edition finished', { topicId, editionId, status, ...stats, collect: undefined });
    return { status, stats };
  } catch (error: unknown) {
    await store.finishRun(runId, { status: 'failed', stats: {}, error: errorMessage(error) });
    throw error;
  }
}

async function processEdition(config: EditionConfig, options: EditionOptions, now: Date, collect: CollectStats): Promise<EditionStats> {
  const store = options.editionStore;
  const fetchImpl = options.fetchImpl ?? fetch;
  const router = new AiRouter({
    providers: await store.loadAiProviders(),
    keys: options.keys,
    usage: store,
    topicId: config.topic.id,
    topicDailyCap: config.topic.aiDailyRequestCap,
    fetchImpl,
    ...(options.sleep ? { sleep: options.sleep } : {}),
    onEvent: (message, fields) => log.warn(message, fields),
  });
  const ctx: StepContext = { store, router, now, topic: { ...config.topic, categories: config.categories, entities: config.entities, modules: config.modules } };
  const windowStart = (await store.lastDigestWindowEnd(config.topic.id)) ?? new Date(now.getTime() - DEFAULT_WINDOW_HOURS * HOUR_MS);
  const counts = { scored: 0, selected: 0, summarized: 0, translated: 0 };

  try {
    counts.scored = await scoreArticles(ctx, await store.loadArticles(config.topic.id, { statuses: ['raw'], fetchedSince: windowStart }));
    counts.selected = await selectEdition(config, store, windowStart, now);
    const selected = await store.loadArticles(config.topic.id, { statuses: ['selected'] });
    const texts = await loadTexts(store, selected, fetchImpl);
    counts.summarized = await summarizeArticles(ctx, selected, texts);
    counts.translated = await translateArticles(ctx, await store.loadArticles(config.topic.id, { statuses: ['summarized'] }));
  } catch (error: unknown) {
    if (!(error instanceof AiUnavailableError)) throw error;
    log.warn('AI unavailable, remaining work left for the next run', { error: error.message });
    return { collect, ...counts, aiStopped: error.message.slice(0, 500) };
  }
  return { collect, ...counts, aiStopped: null };
}

/** Creates today's digest for this edition from scored articles in the window (once per day). */
async function selectEdition(config: EditionConfig, store: EditionStore, windowStart: Date, now: Date): Promise<number> {
  const digestDate = localDate(now, config.edition.timezone);
  if (await store.findDigestId(config.topic.id, config.edition.id, digestDate)) {
    log.info('digest already exists, only finishing pending items', { digestDate });
    return 0;
  }
  const pool = await store.loadArticles(config.topic.id, { statuses: ['scored'], fetchedSince: windowStart });
  const picks = selectDigest(pool.flatMap(toCandidate), config.slots, config.topic.pin, config.edition.sizeMax);
  if (picks.length === 0) return 0;

  // The window closes after this run's own inserts, so the next edition does not reconsider them.
  const windowEnd = new Date(Math.max(now.getTime(), Date.now()));
  const digestId = await store.createDigest({
    topicId: config.topic.id, editionId: config.edition.id, digestDate, windowStart, windowEnd,
  });
  await store.addDigestItems(digestId, picks);
  for (const pick of picks) await store.updateArticle(pick.articleId, { status: 'selected' });
  return picks.length;
}

async function loadTexts(store: EditionStore, articles: readonly ArticleRow[], fetchImpl: FetchLike): Promise<Map<string, string>> {
  const texts = new Map<string, string>();
  for (const article of articles) {
    const content = await loadArticleContent(store, article, fetchImpl);
    texts.set(article.id, content.text);
    await store.updateArticle(article.id, { contentSnippet: content.text, originalUrl: content.originalUrl });
  }
  return texts;
}

function toCandidate(a: ArticleRow): SelectionCandidate[] {
  if (a.impact === null || a.finalScore === null) return [];
  return [{
    id: a.id, categoryId: a.categoryId, entityId: a.entityId, impact: a.impact,
    direction: a.direction ?? 'neutral', explains: a.explains, finalScore: a.finalScore,
  }];
}

/** YYYY-MM-DD of `now` in the edition's time zone. */
export function localDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
