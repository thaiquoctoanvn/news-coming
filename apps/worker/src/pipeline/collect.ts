import { mapLimit } from '../http.ts';
import { errorMessage, log } from '../log.ts';
import { authorityForDomain } from '../sources/authority.ts';
import type { Store } from '../store/store.ts';
import type {
  ClusterHead, CollectStats, NewArticle, RawItem, RunStatus, RunTrigger, Source, SourceCountUpdate, TopicConfig,
} from '../types.ts';
import { assignClusters, type ClusterResult } from './cluster.ts';
import { classify, compileMatcher, type Classification } from './filter.ts';
import { canonicalUrl, urlHash } from './normalize.ts';

// Phase 2 pipeline for one topic: fetch → normalize → drop stored → keyword filter → cluster → insert.
// No AI calls here; relevant items stay in status 'raw' for scoring (DESIGN.md §4).

const FETCH_CONCURRENCY = 4;
const MAX_AGE_HOURS = 36;
const MAX_FUTURE_HOURS = 2;
const CLUSTER_WINDOW_HOURS = 48;
const HOUR_MS = 3_600_000;

export type SourceFetcher = (source: Source) => Promise<RawItem[]>;

export interface CollectOptions {
  readonly store: Store;
  readonly topicId: string;
  readonly editionId: string | null;
  readonly trigger: RunTrigger;
  readonly fetchSource: SourceFetcher;
  readonly now?: Date;
}

export interface CollectResult {
  readonly status: RunStatus | 'skipped';
  readonly stats: CollectStats | null;
}

interface Candidate {
  readonly source: Source;
  readonly item: RawItem;
  readonly url: string;
  readonly hash: string;
  readonly publisher: string;
  readonly authority: number;
}

interface Classified {
  readonly candidate: Candidate;
  readonly result: Classification;
}

export async function collectTopic(options: CollectOptions): Promise<CollectResult> {
  const { store, topicId } = options;
  const config = await store.loadTopicConfig(topicId);
  if (!config) {
    log.warn('topic missing or disabled, skipping', { topicId });
    return { status: 'skipped', stats: null };
  }

  const runId = await store.startRun({ topicId, editionId: options.editionId, trigger: options.trigger });
  try {
    const stats = await collectItems(config, options);
    const status: RunStatus = stats.sourceErrors.length === 0 ? 'success' : 'partial';
    await store.finishRun(runId, { status, stats, error: null });
    log.info('collect finished', { topicId, status, ...stats, sourceErrors: stats.sourceErrors.length });
    return { status, stats };
  } catch (error: unknown) {
    await store.finishRun(runId, { status: 'failed', stats: {}, error: errorMessage(error) });
    throw error;
  }
}

/** Fetch → filter → cluster → insert for one topic, inside a run started by the caller. */
export async function collectItems(config: TopicConfig, options: Pick<CollectOptions, 'store' | 'fetchSource' | 'now'>): Promise<CollectStats> {
  const { store } = options;
  const now = options.now ?? new Date();
  const { candidates, sourceErrors } = await fetchAll(config.sources, options, now);

  const fresh = candidates.filter((c) => isFresh(c.item.publishedAt, now));
  const unique = uniqueByHash(fresh);
  const stored = await store.findExistingHashes(config.id, unique.map((c) => c.hash));
  const newOnes = unique.filter((c) => !stored.has(c.hash));

  const matcher = compileMatcher(config);
  const classified = newOnes.map((candidate): Classified => ({
    candidate,
    result: classify(`${candidate.item.title} ${candidate.item.description ?? ''}`, candidate.source, matcher),
  }));
  const relevant = classified.filter((x) => x.result.relevant).sort((a, b) => byPriority(a.candidate, b.candidate));
  const irrelevant = classified.filter((x) => !x.result.relevant);

  const heads = await store.loadClusterHeads(config.id, new Date(now.getTime() - CLUSTER_WINDOW_HOURS * HOUR_MS));
  const clusters = assignClusters(
    relevant.map((x) => ({ title: x.candidate.item.title, sourceId: x.candidate.source.id, publisher: x.candidate.publisher })),
    heads,
  );

  const articles = [
    ...buildRelevantArticles(config.id, relevant, clusters),
    ...irrelevant.map((x) => toArticle(config.id, x, 'filtered_out', null, 1)),
  ];
  await store.insertArticles(articles);
  await store.updateSourceCounts(headCountUpdates(clusters, heads));

  const count = (status: NewArticle['status']): number => articles.filter((a) => a.status === status).length;
  return {
    fetched: candidates.length,
    tooOld: candidates.length - fresh.length,
    alreadyStored: unique.length - newOnes.length,
    filteredOut: count('filtered_out'),
    duplicates: count('duplicate'),
    inserted: count('raw'),
    sourceErrors,
  };
}

async function fetchAll(sources: readonly Source[], options: Pick<CollectOptions, 'store' | 'fetchSource'>, now: Date) {
  const sourceErrors: { source: string; error: string }[] = [];
  const perSource = await mapLimit(sources, FETCH_CONCURRENCY, async (source) => {
    try {
      const raw = await options.fetchSource(source);
      await options.store.updateSourceStatus(source.id, { fetchedAt: now, error: null });
      return raw.flatMap((item) => toCandidate(source, item));
    } catch (error: unknown) {
      const message = errorMessage(error);
      sourceErrors.push({ source: source.name, error: message });
      log.warn('source failed', { source: source.name, error: message });
      await options.store.updateSourceStatus(source.id, { fetchedAt: now, error: message });
      return [];
    }
  });
  return { candidates: perSource.flat(), sourceErrors };
}

function toCandidate(source: Source, item: RawItem): Candidate[] {
  const url = canonicalUrl(item.url);
  if (!url) return [];
  const aggregated = source.kind === 'google_news' || source.kind === 'gdelt';
  const authority = aggregated ? authorityForDomain(item.publisherDomain) : source.authority;
  return [{ source, item, url, hash: urlHash(url), publisher: item.publisher ?? source.name, authority }];
}

function isFresh(publishedAt: Date | undefined, now: Date): boolean {
  if (!publishedAt) return true;
  const ageHours = (now.getTime() - publishedAt.getTime()) / HOUR_MS;
  return ageHours <= MAX_AGE_HOURS && ageHours >= -MAX_FUTURE_HOURS;
}

function uniqueByHash(candidates: readonly Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    if (seen.has(c.hash)) return false;
    seen.add(c.hash);
    return true;
  });
}

/** Highest authority first, then the earliest report, so the best source represents the story. */
function byPriority(a: Candidate, b: Candidate): number {
  if (a.authority !== b.authority) return b.authority - a.authority;
  return (a.item.publishedAt?.getTime() ?? Infinity) - (b.item.publishedAt?.getTime() ?? Infinity);
}

function buildRelevantArticles(topicId: string, relevant: readonly Classified[], clusters: readonly ClusterResult[]): NewArticle[] {
  const batchDuplicates = new Map<number, number>();
  for (const cluster of clusters) {
    if (cluster.kind === 'duplicate-of-batch') batchDuplicates.set(cluster.index, (batchDuplicates.get(cluster.index) ?? 0) + 1);
  }
  return relevant.flatMap((x, i) => {
    const cluster = clusters[i];
    if (!cluster) return [];
    if (cluster.kind === 'new') return [toArticle(topicId, x, 'raw', cluster.clusterKey, 1 + (batchDuplicates.get(i) ?? 0))];
    return [toArticle(topicId, x, 'duplicate', cluster.clusterKey, 1)];
  });
}

/** Stories already stored by an earlier run gain one source per new duplicate. */
function headCountUpdates(clusters: readonly ClusterResult[], heads: readonly ClusterHead[]): SourceCountUpdate[] {
  const counts = new Map(heads.map((h) => [h.id, h.sourceCount]));
  const updated = new Map<string, number>();
  for (const cluster of clusters) {
    if (cluster.kind !== 'duplicate-of-head') continue;
    updated.set(cluster.headId, (updated.get(cluster.headId) ?? counts.get(cluster.headId) ?? 1) + 1);
  }
  return [...updated].map(([articleId, sourceCount]) => ({ articleId, sourceCount }));
}

function toArticle(
  topicId: string,
  { candidate: c, result }: Classified,
  status: NewArticle['status'],
  clusterKey: string | null,
  sourceCount: number,
): NewArticle {
  return {
    topicId,
    sourceId: c.source.id,
    sourceName: c.publisher,
    url: c.url,
    urlHash: c.hash,
    clusterKey,
    title: c.item.title,
    description: c.item.description ?? null,
    publishedAt: c.item.publishedAt ?? null,
    status,
    categoryId: result.categoryId,
    entityId: result.entityId,
    authority: c.authority,
    sourceCount,
  };
}
