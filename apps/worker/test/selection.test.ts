import { describe, expect, test } from 'vitest';
import { finalScore, preRank, preRankScore } from '../src/shared.ts';
import { type SelectionCandidate, type SlotConfig, selectDigest } from '../src/shared.ts';

const NOW = new Date('2026-10-15T00:00:00Z');

const candidate = (id: string, overrides: Partial<SelectionCandidate> = {}): SelectionCandidate => ({
  id, categoryId: 'other', entityId: null, impact: 5, direction: 'neutral', explains: null, finalScore: 50, ...overrides,
});

const slot = (overrides: Partial<SlotConfig> & Pick<SlotConfig, 'id' | 'position' | 'kind'>): SlotConfig => ({
  categoryIds: [], entityIds: [], maxItems: 1, minScore: 0, extraItemMinScore: null, attachModules: [], ...overrides,
});

const SLOTS: SlotConfig[] = [
  slot({ id: 'oil', position: 1, kind: 'category', categoryIds: ['oil'], minScore: 40, attachModules: ['oil_price'] }),
  slot({ id: 'fed', position: 2, kind: 'category', categoryIds: ['fed'], maxItems: 2, minScore: 40, extraItemMinScore: 70 }),
  slot({ id: 'institutions', position: 4, kind: 'per_entity', entityIds: ['strategy', 'coinbase'], maxItems: 5, minScore: 35 }),
  slot({ id: 'geo_gold', position: 5, kind: 'per_category', categoryIds: ['geo', 'gold'], maxItems: 2, minScore: 45 }),
  slot({ id: 'rest', position: 6, kind: 'fill', maxItems: 12, minScore: 50 }),
];

describe('selectDigest', () => {
  test('fills slots in priority order and respects floors', () => {
    const picks = selectDigest([
      candidate('oil-high', { categoryId: 'oil', finalScore: 80 }),
      candidate('oil-cause', { categoryId: 'oil', finalScore: 60, explains: 'oil_price' }),
      candidate('fed-1', { categoryId: 'fed', finalScore: 75 }),
      candidate('fed-2', { categoryId: 'fed', finalScore: 65 }),
      candidate('mstr', { categoryId: 'institution', entityId: 'strategy', finalScore: 40 }),
      candidate('gold', { categoryId: 'gold', finalScore: 46 }),
      candidate('geo-low', { categoryId: 'geo', finalScore: 30 }),
      candidate('other', { finalScore: 55 }),
    ], SLOTS, null, 12);

    expect(picks.map((p) => [p.articleId, p.slotId])).toEqual([
      ['oil-cause', 'oil'], // the item explaining the oil move wins the slot
      ['fed-1', 'fed'], // fed-2 is below the 70 floor for a second item
      ['mstr', 'institutions'],
      ['gold', 'geo_gold'], // geo-low is below the 45 floor
      ['oil-high', 'rest'],
      ['fed-2', 'rest'],
      ['other', 'rest'],
    ]);
    expect(picks.map((p) => p.position)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test('pins extreme negative items first and still respects the max size', () => {
    const picks = selectDigest([
      candidate('crash', { impact: 9, direction: 'negative', finalScore: 95 }),
      candidate('good', { impact: 10, direction: 'positive', finalScore: 99 }),
      candidate('fed', { categoryId: 'fed', finalScore: 60 }),
    ], SLOTS, { minImpact: 9, direction: 'negative', max: 3 }, 2);

    expect(picks).toEqual([
      { articleId: 'crash', slotId: null, isPinned: true, position: 1 },
      { articleId: 'fed', slotId: 'fed', isPinned: false, position: 2 },
    ]);
  });

  test('empty slots stay empty instead of taking low-quality items', () => {
    expect(selectDigest([candidate('weak', { finalScore: 20 })], SLOTS, null, 12)).toEqual([]);
  });
});

describe('scoring', () => {
  const item = { categoryId: 'oil', entityId: null, authority: 0, sourceCount: 1, publishedAt: NOW, fetchedAt: NOW };

  test('final score mixes impact, coverage, authority and staleness', () => {
    expect(finalScore({ ...item, impact: 7 }, NOW)).toBe(70);
    expect(finalScore({ ...item, impact: 7, sourceCount: 4, authority: 5 }, NOW)).toBe(84);
    expect(finalScore({ ...item, impact: 7, sourceCount: 20 }, NOW)).toBe(85); // coverage bonus capped at 15
    expect(finalScore({ ...item, impact: 7, publishedAt: new Date(NOW.getTime() - 20 * 3_600_000) }, NOW)).toBe(68);
  });

  test('pre-ranking prefers official, widely covered, fresh items and caps each category', () => {
    const items = [
      { ...item, id: 'a', authority: 10 },
      { ...item, id: 'b', sourceCount: 3 },
      { ...item, id: 'c' },
      { ...item, id: 'd', categoryId: 'fed' },
    ];

    expect(preRankScore(items[0]!, NOW)).toBeGreaterThan(preRankScore(items[1]!, NOW));
    expect(preRank(items, NOW, 10, 2).map((i) => i.id)).toEqual(['a', 'b', 'd']);
  });
});
