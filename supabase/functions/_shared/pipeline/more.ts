import { type AiRouter, AiUnavailableError } from '../ai/router.ts';
import type { Logger } from '../log.ts';
import { type StepContext, summarizeArticles, translateArticles } from './ai-steps.ts';
import type { AddedBy, DigestInfo, EditionConfig, EditionStore } from './edition-store.ts';
import type { ArticleReader } from './reader.ts';
import type { ArticleRow } from './types.ts';

// Adds readable articles to an existing digest — the "Xem thêm" button (Edge Function) and
// "Cập nhật tin mới" (worker --refresh) — then summarizes and translates them with the same
// faithfulness checks as the edition. Work left when AI quota runs out is finished by the next run.

/** Reads at most this many articles per requested item before giving up (paywalls, blocked pages). */
const MAX_READS_PER_ITEM = 3;
const DEFAULT_MIN_SCORE = 40;

export interface AppendResult {
  readonly added: readonly ArticleRow[];
  readonly unreadable: number;
}

/** Lowest slot floor of the topic: below it an item would not have made any slot. */
export function minimumScore(config: EditionConfig): number {
  const floors = config.slots.map((s) => s.minScore);
  return floors.length > 0 ? Math.min(...floors) : DEFAULT_MIN_SCORE;
}

/**
 * Appends up to `count` of the best readable candidates, skipping stories already in the digest.
 * Each article keeps its own text (content-integrity rules).
 */
export async function appendReadableArticles(options: {
  readonly store: EditionStore;
  readonly reader: ArticleReader;
  readonly digest: DigestInfo;
  readonly candidates: readonly ArticleRow[];
  readonly count: number;
  readonly minScore: number;
  readonly addedBy: AddedBy;
}): Promise<AppendResult> {
  const { store, reader, digest, count } = options;
  const existing = await store.loadDigestItems(digest.id);
  const stories = new Set(existing.flatMap((i) => (i.storyKey ? [i.storyKey] : [])));
  const inDigest = new Set(existing.map((i) => i.articleId));
  const ranked = options.candidates
    .filter((a) => a.status === 'scored' && !inDigest.has(a.id) && (a.finalScore ?? 0) >= options.minScore)
    .sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));

  const added: ArticleRow[] = [];
  let reads = 0;
  let unreadable = 0;
  for (const candidate of ranked) {
    if (added.length >= count || reads >= count * MAX_READS_PER_ITEM) break;
    if (candidate.storyKey && stories.has(candidate.storyKey)) continue;
    reads++;
    const content = await reader.read(candidate);
    if (!content.text) {
      unreadable++;
      continue;
    }
    if (candidate.storyKey) stories.add(candidate.storyKey);
    await store.updateArticle(candidate.id, { status: 'selected', contentSnippet: content.text, originalUrl: content.originalUrl });
    added.push({ ...candidate, status: 'selected', contentSnippet: content.text });
  }

  const lastPosition = Math.max(0, ...existing.map((i) => i.position));
  await store.addDigestItems(
    digest.id,
    added.map((a, i) => ({ articleId: a.id, slotId: null, isPinned: false, position: lastPosition + i + 1 })),
    options.addedBy,
  );
  return { added, unreadable };
}

export interface MoreResult {
  readonly added: number;
  readonly unreadable: number;
  readonly summarized: number;
  readonly translated: number;
  readonly rejected: number;
  /** Set when AI quota stopped the work; the next worker run finishes it. */
  readonly aiStopped: string | null;
}

/** "Xem thêm": more items from the same window as the digest. */
export async function addMoreToDigest(options: {
  readonly store: EditionStore;
  readonly router: AiRouter;
  readonly reader: ArticleReader;
  readonly log: Logger;
  readonly digestId: string;
  readonly now: Date;
}): Promise<MoreResult> {
  const { store, digestId } = options;
  const digest = await store.loadDigest(digestId);
  if (!digest) throw new Error('Digest not found');
  const config = await store.loadEditionConfig(digest.topicId, digest.editionId);
  if (!config) throw new Error('Topic or edition is disabled');

  const pool = (await store.loadArticles(digest.topicId, { statuses: ['scored'], fetchedSince: digest.windowStart }))
    .filter((a) => a.fetchedAt <= digest.windowEnd);
  const { added, unreadable } = await appendReadableArticles({
    store, reader: options.reader, digest, candidates: pool, count: config.topic.moreBatchSize,
    minScore: minimumScore(config), addedBy: 'more',
  });
  options.log.info('more: appended', { digestId, added: added.length, unreadable });
  return { added: added.length, unreadable, ...(await finishArticles(options, config, added)) };
}

/** Summarizes and translates the given selected articles; stops cleanly when AI quota runs out. */
export async function finishArticles(
  options: { readonly store: EditionStore; readonly router: AiRouter; readonly log: Logger; readonly now: Date },
  config: EditionConfig,
  articles: readonly ArticleRow[],
): Promise<Omit<MoreResult, 'added' | 'unreadable'>> {
  const ctx: StepContext = {
    store: options.store, router: options.router, now: options.now, log: options.log,
    topic: { ...config.topic, categories: config.categories, entities: config.entities, modules: config.modules },
  };
  const ids = new Set(articles.map((a) => a.id));
  let summarized = 0;
  let translated = 0;
  let rejected = 0;
  try {
    const summaries = await summarizeArticles(ctx, articles);
    summarized = summaries.done;
    rejected = summaries.rejected;
    const ready = (await options.store.loadArticles(config.topic.id, { statuses: ['summarized'] })).filter((a) => ids.has(a.id));
    const translations = await translateArticles(ctx, ready);
    translated = translations.done;
    rejected += translations.rejected;
  } catch (error: unknown) {
    if (!(error instanceof AiUnavailableError)) throw error;
    options.log.warn('AI unavailable, remaining items finish on the next run', { error: error.message });
    return { summarized, translated, rejected, aiStopped: error.message.slice(0, 300) };
  }
  return { summarized, translated, rejected, aiStopped: null };
}
