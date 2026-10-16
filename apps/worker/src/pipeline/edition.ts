import { errorMessage, log } from '../log.ts';
import { AiRouter, AiUnavailableError, type ApiKeys, type FetchLike, type SelectedItem, type SelectionCandidate, selectDigest } from '../shared.ts';
import type { EditionConfig, EditionStore } from '../store/edition-store.ts';
import type { Store } from '../store/store.ts';
import type { ArticleRow, CollectStats, RunStatus, RunTrigger } from '../types.ts';
import { type StepContext, scoreArticles, summarizeArticles, translateArticles } from './ai-steps.ts';
import { type SourceFetcher, collectItems } from './collect.ts';
import { type ArticleContent, ArticleReader } from './content-step.ts';
import { type ModuleResult, runDataModules } from '../modules/run-modules.ts';
import type { ModuleContext, ModuleStore } from '../modules/types.ts';

// One edition of a topic (DESIGN.md §4–§5, §8.1): collect → score → select readable articles →
// summarize → translate. Unfinished work stays in its status and is resumed by the next run.

const DEFAULT_WINDOW_HOURS = 24;
const HOUR_MS = 3_600_000;
/** Re-selection rounds after dropping unreadable articles. */
const MAX_SELECTION_ROUNDS = 5;

export interface EditionOptions {
  readonly store: Store;
  readonly editionStore: EditionStore;
  readonly topicId: string;
  readonly editionId: string;
  readonly trigger: RunTrigger;
  readonly fetchSource: SourceFetcher;
  readonly keys: ApiKeys;
  /** Data modules run first when the edition has run_modules; omitted in tests that only cover news. */
  readonly modules?: { readonly store: ModuleStore; readonly context: Omit<ModuleContext, 'now'> };
  readonly fetchImpl?: FetchLike;
  readonly now?: Date;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface EditionStats {
  readonly modules?: Record<string, ModuleResult>;
  readonly collect: CollectStats | null;
  readonly scored: number;
  readonly selected: number;
  readonly replaced: number;
  readonly dropped: number;
  readonly summarized: number;
  readonly translated: number;
  /** Items that failed a faithfulness check and were not published. */
  readonly rejected: number;
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
    const modules = config.edition.runModules && options.modules
      ? await runDataModules(topicId, options.modules.store, { ...options.modules.context, now })
      : undefined;
    const collect = await collectItems(topicConfig, { store, fetchSource: options.fetchSource, now });
    const stats = { ...(modules ? { modules } : {}), ...(await processEdition(config, options, now, collect)) };
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
  const sleep = options.sleep ? { sleep: options.sleep } : {};
  const router = new AiRouter({
    providers: await store.loadAiProviders(),
    keys: options.keys,
    usage: store,
    topicId: config.topic.id,
    topicDailyCap: config.topic.aiDailyRequestCap,
    fetchImpl,
    ...sleep,
    onEvent: (message, fields) => log.warn(message, fields),
  });
  const ctx: StepContext = {
    store, router, now,
    topic: { ...config.topic, categories: config.categories, entities: config.entities, modules: config.modules },
  };
  const reader = new ArticleReader({ fetchImpl, ...sleep });
  const windowStart = (await store.lastDigestWindowEnd(config.topic.id)) ?? new Date(now.getTime() - DEFAULT_WINDOW_HOURS * HOUR_MS);
  let counts = { scored: 0, selected: 0, replaced: 0, dropped: 0, summarized: 0, translated: 0, rejected: 0 };

  try {
    counts.scored = await scoreArticles(ctx, await store.loadArticles(config.topic.id, { statuses: ['raw'], fetchedSince: windowStart }));
    counts = { ...counts, ...(await selectEdition(config, store, reader, windowStart, now)) };
    const summaries = await summarizeArticles(ctx, await store.loadArticles(config.topic.id, { statuses: ['selected'] }));
    counts = { ...counts, summarized: summaries.done, rejected: summaries.rejected };
    const translations = await translateArticles(ctx, await store.loadArticles(config.topic.id, { statuses: ['summarized'] }));
    counts = { ...counts, translated: translations.done, rejected: counts.rejected + translations.rejected };
  } catch (error: unknown) {
    if (!(error instanceof AiUnavailableError)) throw error;
    log.warn('AI unavailable, remaining work left for the next run', { error: error.message });
    return { collect, ...counts, aiStopped: error.message.slice(0, 500) };
  }
  return { collect, ...counts, aiStopped: null };
}

interface SelectionCounts {
  readonly selected: number;
  readonly replaced: number;
  readonly dropped: number;
}

/**
 * Creates today's digest for this edition from scored articles in the window (once per day).
 * Every picked article must be readable: an unreadable one is replaced as a whole by a readable
 * report of the same story from another outlet, or dropped so the slot takes its next candidate.
 */
async function selectEdition(
  config: EditionConfig, store: EditionStore, reader: ArticleReader, windowStart: Date, now: Date,
): Promise<SelectionCounts> {
  const digestDate = localDate(now, config.edition.timezone);
  if (await store.findDigestId(config.topic.id, config.edition.id, digestDate)) {
    log.info('digest already exists, only finishing pending items', { digestDate });
    return { selected: 0, replaced: 0, dropped: 0 };
  }

  const pool = new Map((await store.loadArticles(config.topic.id, { statuses: ['scored'], fetchedSince: windowStart })).map((a) => [a.id, a]));
  const contents = new Map<string, ArticleContent>();
  let replaced = 0;
  let dropped = 0;
  let picks: SelectedItem[] = [];

  for (let round = 0; round < MAX_SELECTION_ROUNDS; round++) {
    picks = selectDigest([...pool.values()].flatMap(toCandidate), config.slots, config.topic.pin, config.edition.sizeMax);
    let changed = false;
    for (const pick of picks) {
      const article = pool.get(pick.articleId);
      if (!article || contents.has(article.id)) continue;
      const content = await reader.read(article);
      if (content.text) {
        contents.set(article.id, content);
        continue;
      }
      changed = true;
      pool.delete(article.id);
      const substitute = await findReadableSubstitute(store, reader, article, contents);
      if (substitute) {
        pool.set(substitute.id, substitute);
        replaced++;
      } else {
        dropped++;
      }
    }
    if (!changed) break;
  }

  const readable = picks.filter((p) => contents.get(p.articleId)?.text).map((p, i) => ({ ...p, position: i + 1 }));
  if (readable.length === 0) return { selected: 0, replaced, dropped };

  // The window closes after this run's own inserts, so the next edition does not reconsider them.
  const windowEnd = new Date(Math.max(now.getTime(), Date.now()));
  const digestId = await store.createDigest({ topicId: config.topic.id, editionId: config.edition.id, digestDate, windowStart, windowEnd });
  await store.addDigestItems(digestId, readable);
  for (const pick of readable) {
    const content = contents.get(pick.articleId);
    await store.updateArticle(pick.articleId, { status: 'selected', contentSnippet: content?.text ?? '', originalUrl: content?.originalUrl ?? null });
  }
  return { selected: readable.length, replaced, dropped };
}

/** A readable article from another outlet about the same story, taking over the original's scores. */
async function findReadableSubstitute(
  store: EditionStore, reader: ArticleReader, original: ArticleRow, contents: Map<string, ArticleContent>,
): Promise<ArticleRow | null> {
  if (!original.clusterKey) return null;
  for (const member of await store.loadClusterMembers(original.topicId, original.clusterKey, original.id)) {
    if (member.status !== 'duplicate') continue;
    const content = await reader.read(member);
    if (!content.text) continue;
    contents.set(member.id, content);
    const scores = {
      categoryId: original.categoryId, entityId: original.entityId, impact: original.impact ?? 0,
      direction: original.direction ?? 'neutral', explains: original.explains, finalScore: original.finalScore ?? 0,
      storyKey: original.storyKey,
    } as const;
    await store.updateArticle(member.id, { status: 'scored', ...scores, scoredAt: new Date() });
    log.info('replaced unreadable article', { original: original.sourceName, substitute: member.sourceName });
    return { ...member, ...scores, status: 'scored' };
  }
  return null;
}

function toCandidate(a: ArticleRow): SelectionCandidate[] {
  if (a.impact === null || a.finalScore === null) return [];
  return [{
    id: a.id, categoryId: a.categoryId, entityId: a.entityId, impact: a.impact,
    direction: a.direction ?? 'neutral', explains: a.explains, finalScore: a.finalScore, storyKey: a.storyKey,
  }];
}

/** YYYY-MM-DD of `now` in the edition's time zone. */
export function localDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
