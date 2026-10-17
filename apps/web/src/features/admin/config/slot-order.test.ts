import { describe, expect, test } from 'vitest';
import { moveIds, positionChanges, slotId } from './slot-order.ts';

describe('slot ordering', () => {
  test('moves an item before or after a target', () => {
    expect(moveIds(['a', 'b', 'c', 'd'], ['d'], 'b', 'before')).toEqual(['a', 'd', 'b', 'c']);
    expect(moveIds(['a', 'b', 'c', 'd'], ['a'], 'c', 'after')).toEqual(['b', 'c', 'a', 'd']);
    expect(moveIds(['a', 'b'], ['a'], 'a', 'after')).toEqual(['a', 'b']);
  });

  test('only rows whose position changed are updated', () => {
    const current = new Map([['a', 1], ['b', 2], ['c', 3]]);
    expect(positionChanges(['a', 'c', 'b'], current)).toEqual([{ id: 'c', position: 2 }, { id: 'b', position: 3 }]);
  });

  test('builds an ascii id from a Vietnamese name', () => {
    expect(slotId('Địa chính trị + Vàng', 0.5)).toBe('dia_chinh_tri_vang_i');
  });
});
