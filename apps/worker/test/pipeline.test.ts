import { describe, expect, test } from 'vitest';
import { assignClusters, jaccard } from '../src/pipeline/cluster.ts';
import { classify, compileMatcher, keywordPattern } from '../src/pipeline/filter.ts';
import { canonicalUrl, titleTokens, urlHash } from '../src/pipeline/normalize.ts';
import type { Source, TopicConfig } from '../src/types.ts';

const source = (overrides: Partial<Source> = {}): Source => ({
  id: 's1', name: 'Test', kind: 'rss', url: 'https://example.com/feed', query: null,
  defaultCategoryId: null, defaultEntityId: null, authority: 0, ...overrides,
});

const config: TopicConfig = {
  id: 'macro_finance',
  excludeKeywords: ['price today'],
  sources: [],
  categories: [
    { id: 'oil', keywords: ['oil', 'opec'], excludeKeywords: ['olive oil'], position: 1 },
    { id: 'geo', keywords: ['sanctions', 'tariff'], excludeKeywords: [], position: 2 },
    { id: 'tokenization', keywords: ['tokeniz*'], excludeKeywords: [], position: 3 },
  ],
  entities: [{ id: 'strategy', aliases: ['MicroStrategy', 'MSTR'], position: 1 }],
};

describe('canonicalUrl / urlHash', () => {
  test('removes tracking parameters and fragments, keeps real query parameters', () => {
    expect(canonicalUrl('https://Example.com/a?utm_source=x&id=2&fbclid=y#top')).toBe('https://example.com/a?id=2');
  });

  test('rejects non-http URLs', () => {
    expect(canonicalUrl('javascript:alert(1)')).toBeNull();
    expect(canonicalUrl('not a url')).toBeNull();
  });

  test('hash ignores scheme, www and trailing slash', () => {
    const a = urlHash('https://www.example.com/news/1/');
    expect(urlHash('http://example.com/news/1')).toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('keyword filter', () => {
  const matcher = compileMatcher(config);

  test('matches whole words and plurals, not substrings', () => {
    expect(keywordPattern('tariff').test('New tariffs on steel')).toBe(true);
    expect(keywordPattern('oil').test('Boiling point')).toBe(false);
  });

  test('a trailing * matches as prefix', () => {
    expect(keywordPattern('tokeniz*').test('Tokenization push on Wall Street')).toBe(true);
  });

  test('assigns the first matching category by position and the matched entity', () => {
    expect(classify('MSTR buys more bitcoin despite oil sanctions', source(), matcher)).toEqual({
      relevant: true, categoryId: 'oil', entityId: 'strategy',
    });
  });

  test('category exclude keywords and topic exclude keywords drop the item', () => {
    expect(classify('Olive oil exports rise', source(), matcher).relevant).toBe(false);
    expect(classify('Oil price today and chart', source(), matcher).relevant).toBe(false);
  });

  test('official sources pass without keyword match and keep their defaults', () => {
    const official = source({ authority: 10, defaultCategoryId: 'fed' });

    expect(classify('Minutes of the Board meeting', official, matcher)).toEqual({ relevant: true, categoryId: 'fed', entityId: null });
    expect(classify('Minutes of the Board meeting', source(), matcher).relevant).toBe(false);
  });
});

describe('clustering', () => {
  test('jaccard similarity of title tokens', () => {
    expect(jaccard(titleTokens('Oil prices surge on Iran'), titleTokens('Oil prices surge on Iran news'))).toBeGreaterThan(0.7);
    expect(jaccard(new Set(), new Set(['a']))).toBe(0);
  });

  test('similar titles from different publishers join the same cluster', () => {
    const results = assignClusters(
      [
        { title: 'Oil prices surge as Iran targets tankers', sourceId: 'g1', publisher: 'Reuters' },
        { title: 'Oil prices surge as Iran targets oil tankers', sourceId: 'g1', publisher: 'CNBC' },
        { title: 'Gold flat ahead of CPI data', sourceId: 'g2', publisher: 'Reuters' },
      ],
      [],
    );

    expect(results[0]?.kind).toBe('new');
    expect(results[1]).toEqual({ kind: 'duplicate-of-batch', clusterKey: results[0]?.clusterKey, index: 0 });
    expect(results[2]?.kind).toBe('new');
  });

  test('same source and publisher never merge (e.g. two 8-K filings)', () => {
    const filing = { title: 'Strategy Inc — 8-K: Other events', sourceId: 'edgar', publisher: 'SEC EDGAR' };

    expect(assignClusters([filing, filing], []).map((r) => r.kind)).toEqual(['new', 'new']);
  });

  test('matches stories stored by earlier runs', () => {
    const head = { id: 'a1', clusterKey: 'k1', title: 'Fed holds rates steady at September meeting', sourceId: 'x', sourceName: 'Reuters', sourceCount: 2 };

    expect(assignClusters([{ title: 'Fed holds rates steady at September meeting, signals cuts', sourceId: 'y', publisher: 'AP' }], [head]))
      .toEqual([{ kind: 'duplicate-of-head', clusterKey: 'k1', headId: 'a1' }]);
  });
});
