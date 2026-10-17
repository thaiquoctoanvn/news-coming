import { describe, expect, test } from 'vitest';
import { chooseDigest, orderArticles, impactLabel, paragraphs } from './digest.ts';
import { formatChange, relativeDay, safeUrl, vietnamDay } from './format.ts';
import { chartRows, latestValues } from './market.ts';
import type { DigestArticle } from './types.ts';

const digests = [
  { id: 'd3', editionId: 'pre_us', date: '2026-10-16' },
  { id: 'd2', editionId: 'morning', date: '2026-10-16' },
  { id: 'd1', editionId: 'morning', date: '2026-10-15' },
];

const article = (id: string, position: number, slotId: string | null, isPinned = false): DigestArticle => ({
  id, position, slotId, isPinned, sourceName: 'CNBC', url: 'https://cnbc.com/x', publishedAt: null,
  categoryId: 'oil', impact: 5, direction: 'neutral', title: id, summary: 'A.\n\nB.',
});

describe('chooseDigest', () => {
  test('defaults to the newest date and its latest edition', () => {
    expect(chooseDigest(digests, null, null)).toMatchObject({ date: '2026-10-16', editionIds: ['pre_us', 'morning'], digest: { id: 'd3' } });
  });

  test('honors valid URL params and ignores unknown ones', () => {
    expect(chooseDigest(digests, '2026-10-16', 'morning').digest?.id).toBe('d2');
    expect(chooseDigest(digests, '2026-10-15', 'pre_us').digest?.id).toBe('d1');
    expect(chooseDigest(digests, '1999-01-01', null).date).toBe('2026-10-16');
    expect(chooseDigest([], null, null)).toEqual({ dates: [], date: null, editionIds: [], digest: null });
  });
});

describe('orderArticles', () => {
  test('pinned first, then by position', () => {
    const ordered = orderArticles([article('b', 3, 'fed'), article('pin', 4, null, true), article('a', 2, 'oil')]);

    expect(ordered.map((a) => a.id)).toEqual(['pin', 'a', 'b']);
  });
});

describe('formatting', () => {
  test('impact labels and paragraphs', () => {
    expect([impactLabel(9), impactLabel(6), impactLabel(4), impactLabel(1), impactLabel(null)])
      .toEqual(['Tác động rất mạnh', 'Tác động mạnh', 'Tác động vừa', 'Tác động nhẹ', null]);
    expect(paragraphs('One.\n\n  Two.\n\n\n')).toEqual(['One.', 'Two.']);
  });

  test('only http(s) links are allowed', () => {
    expect(safeUrl('https://www.cnbc.com/a')).toBe('https://www.cnbc.com/a');
    expect(safeUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeUrl('data:text/html,hi')).toBeUndefined();
    expect(safeUrl(null)).toBeUndefined();
  });

  test('days are counted in Vietnam time', () => {
    const now = new Date('2026-10-16T03:00:00Z'); // 10:00 in Vietnam
    expect(vietnamDay('2026-10-16T18:00:00Z')).toBe('2026-10-17');
    expect(relativeDay('2026-10-16T10:00:00Z', now)).toBe('hôm nay');
    expect(relativeDay('2026-10-17T03:00:00Z', now)).toBe('ngày mai');
    expect(relativeDay('2026-10-28T18:00:00Z', now)).toBe('còn 13 ngày');
    expect(relativeDay('2026-10-14T12:30:00Z', now)).toBe('đã qua');
  });

  test('changes use a real minus sign', () => {
    expect(formatChange(-0.09, 2)).toBe('−0,09');
    expect(formatChange(0.5, 2)).toBe('+0,50');
    expect(formatChange(null)).toBe('');
  });
});

describe('market helpers', () => {
  const points = [
    { series: 'US10Y', date: '2026-10-14', value: 5.19 },
    { series: 'US10Y', date: '2026-10-15', value: 5.1 },
    { series: 'WTI', date: '2026-10-15', value: 95.81 },
  ];

  test('latest value and change per series, in display order', () => {
    const latest = latestValues(points);
    expect(latest.map((v) => [v.info.id, v.value])).toEqual([['WTI', 95.81], ['US10Y', 5.1]]);
    expect(latest[1]?.change).toBeCloseTo(-0.09);
    expect(latest[0]?.change).toBeNull();
  });

  test('chart rows join series by date', () => {
    expect(chartRows(points, ['US10Y', 'WTI'])).toEqual([
      { date: '2026-10-14', US10Y: 5.19 },
      { date: '2026-10-15', US10Y: 5.1, WTI: 95.81 },
    ]);
  });
});
