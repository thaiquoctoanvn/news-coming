import type { DigestArticle, DigestSummary, Direction } from './types.ts';

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

/** Digest order: pinned items first, then by position. */
export function orderArticles(articles: readonly DigestArticle[]): DigestArticle[] {
  return [...articles].sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || a.position - b.position);
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
