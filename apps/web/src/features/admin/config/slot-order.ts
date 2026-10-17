// Pure helpers for reordering priority slots (unit-tested).

/** Moves `moving` ids before/after `target`, keeping the rest in place. */
export function moveIds(ids: readonly string[], moving: readonly string[], target: string, where: 'before' | 'after'): string[] {
  if (moving.includes(target)) return [...ids];
  const rest = ids.filter((id) => !moving.includes(id));
  const at = rest.indexOf(target) + (where === 'after' ? 1 : 0);
  return [...rest.slice(0, at), ...ids.filter((id) => moving.includes(id)), ...rest.slice(at)];
}

/** Position changes (1-based) needed so the rows follow `order`. */
export function positionChanges(order: readonly string[], current: ReadonlyMap<string, number>): { id: string; position: number }[] {
  return order.map((id, i) => ({ id, position: i + 1 })).filter((c) => current.get(c.id) !== c.position);
}

/** Stable id for a new slot from its name, e.g. "Giá vàng" → "gia_vang_k3x9". */
export function slotId(name: string, random = Math.random()): string {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'slot';
  return `${base}_${random.toString(36).slice(2, 6)}`;
}
