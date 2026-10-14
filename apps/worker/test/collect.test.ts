import { describe, expect, test } from 'vitest';
import { collectTopic, type SourceFetcher } from '../src/pipeline/collect.ts';
import { MemoryStore } from '../src/store/memory-store.ts';
import type { RawItem, Source, TopicConfig } from '../src/types.ts';

const NOW = new Date('2026-10-14T00:00:00Z');
const hoursAgo = (h: number): Date => new Date(NOW.getTime() - h * 3_600_000);

const fed: Source = {
  id: 'fed', name: 'Fed press', kind: 'rss', url: 'https://www.federalreserve.gov/feeds/press_all.xml', query: null,
  defaultCategoryId: 'fed', defaultEntityId: null, authority: 10,
};
const news: Source = {
  id: 'gn', name: 'Google News: oil', kind: 'google_news', url: null, query: 'oil',
  defaultCategoryId: 'oil', defaultEntityId: null, authority: 0,
};
const broken: Source = { ...news, id: 'broken', name: 'Broken feed' };

const config: TopicConfig = {
  id: 'macro_finance',
  excludeKeywords: [],
  sources: [fed, news, broken],
  categories: [{ id: 'oil', keywords: ['oil'], excludeKeywords: [], position: 1 }],
  entities: [],
};

const feeds: Record<string, RawItem[]> = {
  fed: [
    { url: 'https://www.federalreserve.gov/a.htm', title: 'Federal Reserve Board announces approval', publishedAt: hoursAgo(2) },
    { url: 'https://www.federalreserve.gov/old.htm', title: 'Old release', publishedAt: hoursAgo(80) },
  ],
  gn: [
    { url: 'https://news.google.com/1', title: 'Oil prices surge as Iran targets tankers', publisher: 'Reuters', publisherDomain: 'reuters.com', publishedAt: hoursAgo(3) },
    { url: 'https://news.google.com/2?utm_source=x', title: 'Oil prices surge as Iran targets oil tankers', publisher: 'CNBC', publisherDomain: 'cnbc.com', publishedAt: hoursAgo(1) },
    { url: 'https://news.google.com/2', title: 'Same URL after canonicalization', publisher: 'CNBC', publishedAt: hoursAgo(1) },
    { url: 'https://news.google.com/3', title: 'Celebrity wedding photos', publisher: 'Gossip', publishedAt: hoursAgo(1) },
  ],
};

const fetcher: SourceFetcher = async (source) => {
  if (source.id === 'broken') throw new Error('HTTP 503');
  return feeds[source.id] ?? [];
};

const run = (store: MemoryStore, fetchSource: SourceFetcher = fetcher) =>
  collectTopic({ store, topicId: 'macro_finance', editionId: 'morning', trigger: 'manual', fetchSource, now: NOW });

describe('collectTopic', () => {
  test('stores fresh relevant items as raw, clusters duplicates and filters noise', async () => {
    const store = new MemoryStore([config]);

    const result = await run(store);

    expect(result.status).toBe('partial');
    expect(result.stats).toEqual({
      fetched: 6, tooOld: 1, alreadyStored: 0, filteredOut: 1, duplicates: 1, inserted: 2,
      sourceErrors: [{ source: 'Broken feed', error: 'HTTP 503' }],
    });
    const byTitle = new Map(store.articles.map((a) => [a.title, a]));
    expect(byTitle.get('Oil prices surge as Iran targets tankers')).toMatchObject({ status: 'raw', authority: 5, sourceCount: 2, sourceName: 'Reuters' });
    expect(byTitle.get('Oil prices surge as Iran targets oil tankers')?.status).toBe('duplicate');
    expect(byTitle.get('Celebrity wedding photos')?.status).toBe('filtered_out');
    expect(byTitle.get('Federal Reserve Board announces approval')).toMatchObject({ status: 'raw', categoryId: 'fed', authority: 10 });
    expect(store.sourceStatus.get('broken')?.error).toBe('HTTP 503');
    expect(store.runs[0]?.finish?.status).toBe('partial');
  });

  test('a second run stores nothing new', async () => {
    const store = new MemoryStore([config]);
    await run(store);

    const second = await run(store);

    expect(second.stats).toMatchObject({ inserted: 0, duplicates: 0, filteredOut: 0, alreadyStored: 4 });
  });

  test('a later report of a stored story increases its source count', async () => {
    const store = new MemoryStore([config]);
    await run(store);
    const later: SourceFetcher = async (source) => (source.id === 'gn'
      ? [{ url: 'https://news.google.com/9', title: 'Oil prices surge as Iran targets tankers again', publisher: 'AP', publishedAt: hoursAgo(0) }]
      : []);

    await run(store, later);

    const story = store.articles.find((a) => a.title === 'Oil prices surge as Iran targets tankers');
    expect(story?.sourceCount).toBe(3);
  });

  test('skips disabled or unknown topics without starting a run', async () => {
    const store = new MemoryStore([]);

    expect(await run(store)).toEqual({ status: 'skipped', stats: null });
    expect(store.runs).toHaveLength(0);
  });

  test('marks the run failed when storage breaks', async () => {
    const store = new MemoryStore([config]);
    store.insertArticles = async () => {
      throw new Error('db down');
    };

    await expect(run(store)).rejects.toThrow('db down');
    expect(store.runs[0]?.finish).toMatchObject({ status: 'failed', error: 'db down' });
  });
});
