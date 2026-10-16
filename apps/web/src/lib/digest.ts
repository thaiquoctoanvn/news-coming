import type { DigestArticle, DigestSummary, Direction, Slot } from './types.ts';

// Pure helpers for the digest page (unit-tested).

export interface DigestChoice {
  readonly dates: readonly string[];
  readonly date: string | null;
  readonly editionIds: readonly string[];
  readonly digest: DigestSummary | null;
}

/** Selected digest from URL params, defaulting to the newest date and that day's latest edition. */
export function chooseDigest(digests: readonly DigestSummary[], date: string | null, editionId: string | null): DigestChoice {
  const dates = [...new Set(digests.map((d) => d.date))];
  const selectedDate = date && dates.includes(date) ? date : dates[0] ?? null;
  const ofDay = digests.filter((d) => d.date === selectedDate);
  const digest = ofDay.find((d) => d.editionId === editionId) ?? ofDay[0] ?? null;
  return { dates, date: selectedDate, editionIds: ofDay.map((d) => d.editionId), digest };
}

export interface ArticleGroup {
  readonly key: string;
  readonly label: string;
  readonly articles: readonly DigestArticle[];
}

/** Pinned items first, then one group per slot in slot order. */
export function groupArticles(articles: readonly DigestArticle[], slots: readonly Slot[]): ArticleGroup[] {
  const ordered = [...articles].sort((a, b) => a.position - b.position);
  const pinned = ordered.filter((a) => a.isPinned);
  const groups: ArticleGroup[] = pinned.length > 0 ? [{ key: 'pinned', label: 'Tin nóng', articles: pinned }] : [];
  for (const slot of [...slots].sort((a, b) => a.position - b.position)) {
    const inSlot = ordered.filter((a) => !a.isPinned && a.slotId === slot.id);
    if (inSlot.length > 0) groups.push({ key: slot.id, label: slot.label, articles: inSlot });
  }
  const unslotted = ordered.filter((a) => !a.isPinned && !slots.some((s) => s.id === a.slotId));
  if (unslotted.length > 0) groups.push({ key: 'other', label: 'Tin khác', articles: unslotted });
  return groups;
}

export function impactLabel(impact: number | null): string | null {
  if (impact === null) return null;
  if (impact >= 8) return 'Tác động rất mạnh';
  if (impact >= 6) return 'Tác động mạnh';
  if (impact >= 4) return 'Tác động vừa';
  return 'Tác động nhẹ';
}

export const DIRECTION_LABEL: Readonly<Record<Direction, { label: string; color: 'danger' | 'success' | 'default' }>> = {
  negative: { label: 'Tiêu cực', color: 'danger' },
  positive: { label: 'Tích cực', color: 'success' },
  neutral: { label: 'Trung lập', color: 'default' },
};

export function paragraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}
