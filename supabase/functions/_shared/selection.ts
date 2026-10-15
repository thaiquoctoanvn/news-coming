// Picks the digest items from scored candidates (DESIGN.md §5):
// 1) pin extreme items, 2) fill slots in priority order, 3) stop at the edition's max size.

export type Direction = 'negative' | 'neutral' | 'positive';
export type SlotKind = 'category' | 'per_category' | 'per_entity' | 'fill';

export interface SelectionCandidate {
  readonly id: string;
  readonly categoryId: string | null;
  readonly entityId: string | null;
  readonly impact: number;
  readonly direction: Direction;
  readonly explains: string | null;
  readonly finalScore: number;
}

export interface SlotConfig {
  readonly id: string;
  readonly position: number;
  readonly kind: SlotKind;
  readonly categoryIds: readonly string[];
  readonly entityIds: readonly string[];
  readonly maxItems: number;
  readonly minScore: number;
  readonly extraItemMinScore: number | null;
  readonly attachModules: readonly string[];
}

export interface PinRule {
  readonly minImpact: number;
  readonly direction: Direction;
  readonly max: number;
}

export interface SelectedItem {
  readonly articleId: string;
  readonly slotId: string | null;
  readonly isPinned: boolean;
  readonly position: number;
}

export function selectDigest(
  candidates: readonly SelectionCandidate[],
  slots: readonly SlotConfig[],
  pin: PinRule | null,
  maxSize: number,
): SelectedItem[] {
  const ranked = [...candidates].sort((a, b) => b.finalScore - a.finalScore);
  const used = new Set<string>();
  const picks: { candidate: SelectionCandidate; slotId: string | null; isPinned: boolean }[] = [];
  const take = (candidate: SelectionCandidate, slotId: string | null, isPinned: boolean): void => {
    used.add(candidate.id);
    picks.push({ candidate, slotId, isPinned });
  };

  if (pin) {
    ranked
      .filter((c) => c.impact >= pin.minImpact && c.direction === pin.direction)
      .slice(0, Math.min(pin.max, maxSize))
      .forEach((c) => take(c, null, true));
  }

  for (const slot of [...slots].sort((a, b) => a.position - b.position)) {
    const room = maxSize - picks.length;
    if (room <= 0) break;
    const available = ranked.filter((c) => !used.has(c.id));
    for (const candidate of fillSlot(slot, available, Math.min(slot.maxItems, room))) take(candidate, slot.id, false);
  }

  return picks.map((p, index) => ({ articleId: p.candidate.id, slotId: p.slotId, isPinned: p.isPinned, position: index + 1 }));
}

function fillSlot(slot: SlotConfig, available: readonly SelectionCandidate[], limit: number): SelectionCandidate[] {
  const eligible = available.filter((c) => c.finalScore >= slot.minScore);
  switch (slot.kind) {
    case 'category':
      return pickCategory(slot, eligible, limit);
    case 'per_category':
      return pickOnePerKey(slot.categoryIds, eligible, (c) => c.categoryId, limit);
    case 'per_entity':
      return pickOnePerKey(slot.entityIds, eligible, (c) => c.entityId, limit);
    case 'fill':
      return eligible.slice(0, limit);
  }
}

/** Best items of the slot's categories; with attached data series, an item explaining the move goes first. */
function pickCategory(slot: SlotConfig, eligible: readonly SelectionCandidate[], limit: number): SelectionCandidate[] {
  const inSlot = eligible.filter((c) => c.categoryId !== null && slot.categoryIds.includes(c.categoryId));
  const explainsMove = (c: SelectionCandidate): boolean => c.explains !== null && slot.attachModules.includes(c.explains);
  const ordered = [...inSlot.filter(explainsMove), ...inSlot.filter((c) => !explainsMove(c))];
  const extraMin = slot.extraItemMinScore ?? slot.minScore;
  return ordered.filter((c, index) => index === 0 || c.finalScore >= extraMin).slice(0, limit);
}

function pickOnePerKey(
  keys: readonly string[],
  eligible: readonly SelectionCandidate[],
  keyOf: (c: SelectionCandidate) => string | null,
  limit: number,
): SelectionCandidate[] {
  return keys
    .flatMap((key) => {
      const best = eligible.find((c) => keyOf(c) === key);
      return best ? [best] : [];
    })
    .slice(0, limit);
}
