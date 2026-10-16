export type Direction = 'negative' | 'neutral' | 'positive';

export interface Topic {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
}

export interface Edition {
  readonly id: string;
  readonly name: string;
  readonly timezone: string;
  readonly localTime: string;
}

export interface DigestSummary {
  readonly id: string;
  readonly editionId: string;
  readonly date: string;
}

export interface DigestArticle {
  readonly id: string;
  readonly position: number;
  readonly slotId: string | null;
  readonly isPinned: boolean;
  readonly sourceName: string;
  readonly url: string;
  readonly publishedAt: string | null;
  readonly categoryId: string | null;
  readonly impact: number | null;
  readonly direction: Direction | null;
  readonly title: string;
  readonly summary: string;
}

export interface Slot {
  readonly id: string;
  readonly position: number;
  readonly label: string;
}

export interface MarketPoint {
  readonly series: string;
  readonly date: string;
  readonly value: number;
}

export interface CalendarEvent {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly startsAt: string;
  readonly importance: number;
  readonly sourceUrl: string | null;
}
