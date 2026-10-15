// Picks the digest items from scored candidates (DESIGN.md §5):
// 1) pin extreme items, 2) fill slots in priority order, 3) stop at the edition's max size.
// One item per story: other reports of an already picked event are skipped.

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
  /** Event slug from scoring; items sharing it are the same story. */
  readonly storyKey: string | null;
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
  const usedStories = new Set<string>();
  const picks: { candidate: SelectionCandidate; slotId: string | null; isPinned: boolean }[] = [];
  const isAvailable = (c: SelectionCandidate): boolean => !used.has(c.id) && !(c.storyKey && usedStories.has(c.storyKey));
  const take = (candidate: SelectionCandidate, slotId: string | null, isPinned: boolean): void => {
    used.add(candidate.id);
    if (candidate.storyKey) usedStories.add(candidate.storyKey);
    picks.push({ candidate, slotId, isPinned });
  };

  if (pin) {
    for (const c of ranked.filter((x) => x.impact >= pin.minImpact && x.direction === pin.direction)) {
      if (picks.length >= Math.min(pin.max, maxSize)) break;
      if (isAvailable(c)) take(c, null, true);
    }
  }

  for (const slot of [...slots].sort((a, b) => a.position - b.position)) {
    if (picks.length >= maxSize) break;
    // Re-filter after every pick so two items of the same story never enter one slot either.
    for (const candidate of fillSlot(slot, ranked, isAvailable, Math.min(slot.maxItems, maxSize - picks.length))) {
      take(candidate, slot.id, false);
    }
  }

  return picks.map((p, index) => ({ articleId: p.candidate.id, slotId: p.slotId, isPinned: p.isPinned, position: index + 1 }));
}

function fillSlot(
  slot: SlotConfig,
  ranked: readonly SelectionCandidate[],
  isAvailable: (c: SelectionCandidate) => boolean,
  limit: number,
): SelectionCandidate[] {
  const picked: SelectionCandidate[] = [];
  const stories = new Set<string>();
  const ok = (c: SelectionCandidate): boolean =>
    isAvailable(c) && c.finalScore >= slot.minScore && !(c.storyKey && stories.has(c.storyKey));
  const add = (c: SelectionCandidate): void => {
    picked.push(c);
    if (c.storyKey) stories.add(c.storyKey);
  };

  switch (slot.kind) {
    case 'category': {
      const inSlot = ranked.filter((c) => c.categoryId !== null && slot.categoryIds.includes(c.categoryId));
      const explainsMove = (c: SelectionCandidate): boolean => c.explains !== null && slot.attachModules.includes(c.explains);
      const extraMin = slot.extraItemMinScore ?? slot.minScore;
      for (const c of [...inSlot.filter(explainsMove), ...inSlot.filter((x) => !explainsMove(x))]) {
        if (picked.length >= limit) break;
        if (ok(c) && (picked.length === 0 || c.finalScore >= extraMin)) add(c);
      }
      return picked;
    }
    case 'per_category':
    case 'per_entity': {
      const keys = slot.kind === 'per_category' ? slot.categoryIds : slot.entityIds;
      const keyOf = (c: SelectionCandidate): string | null => (slot.kind === 'per_category' ? c.categoryId : c.entityId);
      for (const key of keys) {
        if (picked.length >= limit) break;
        const best = ranked.find((c) => keyOf(c) === key && ok(c));
        if (best) add(best);
      }
      return picked;
    }
    case 'fill':
      for (const c of ranked) {
        if (picked.length >= limit) break;
        if (ok(c)) add(c);
      }
      return picked;
  }
}
