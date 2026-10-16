import type { MarketPoint } from './types.ts';

// Display metadata for market series shown on the digest and chart pages.

export interface SeriesInfo {
  readonly id: string;
  readonly label: string;
  readonly unit: '%' | 'USD';
  readonly group: 'oil' | 'us' | 'jp';
}

export const SERIES: readonly SeriesInfo[] = [
  { id: 'WTI', label: 'Dầu WTI', unit: 'USD', group: 'oil' },
  { id: 'BRENT', label: 'Dầu Brent', unit: 'USD', group: 'oil' },
  { id: 'US2Y', label: 'Mỹ 2 năm', unit: '%', group: 'us' },
  { id: 'US10Y', label: 'Mỹ 10 năm', unit: '%', group: 'us' },
  { id: 'US30Y', label: 'Mỹ 30 năm', unit: '%', group: 'us' },
  { id: 'JP10Y', label: 'Nhật 10 năm', unit: '%', group: 'jp' },
  { id: 'JP30Y', label: 'Nhật 30 năm', unit: '%', group: 'jp' },
];

export interface LatestValue {
  readonly info: SeriesInfo;
  readonly date: string;
  readonly value: number;
  readonly change: number | null;
}

/** Latest value of each known series with its change from the previous observation. */
export function latestValues(points: readonly MarketPoint[]): LatestValue[] {
  return SERIES.flatMap((info) => {
    const series = points.filter((p) => p.series === info.id).sort((a, b) => a.date.localeCompare(b.date));
    const last = series.at(-1);
    if (!last) return [];
    const previous = series.at(-2);
    return [{ info, date: last.date, value: last.value, change: previous ? last.value - previous.value : null }];
  });
}

/** Rows for a multi-series chart: one row per date, one column per series. */
export function chartRows(points: readonly MarketPoint[], seriesIds: readonly string[]): Record<string, number | string>[] {
  const byDate = new Map<string, Record<string, number | string>>();
  for (const p of points) {
    if (!seriesIds.includes(p.series)) continue;
    const row = byDate.get(p.date) ?? { date: p.date };
    row[p.series] = p.value;
    byDate.set(p.date, row);
  }
  return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
