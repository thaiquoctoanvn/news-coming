import { describe, expect, test } from 'vitest';
import { distribute } from './MasonryGrid.tsx';

describe('distribute', () => {
  test('keeps the first row in priority order, then fills the shortest column', () => {
    const heights: Record<string, number> = { a: 300, b: 100, c: 200, d: 100, e: 100 };
    const columns = distribute(['a', 'b', 'c', 'd', 'e'], 3, (k) => heights[k]!);

    expect(columns).toEqual([['a'], ['b', 'd', 'e'], ['c']]);
  });

  test('uses a single column when asked for none', () => {
    expect(distribute([1, 2], 0, () => 1)).toEqual([[1, 2]]);
  });
});
