import type { MarketPoint } from './types.ts';

// Display metadata for market series shown on the digest and chart pages.

export interface SeriesInfo {
  readonly id: string;
  readonly label: string;
  readonly unit: '%' | 'USD';
  readonly group: 'oil' | 'gold' | 'us' | 'jp';
  /** A rise in oil or yields puts pressure on markets (shown in red); gold has no fixed reading. */
  readonly riseIsPressure: boolean;
}

export const SERIES: readonly SeriesInfo[] = [
  { id: 'WTI', label: 'Dầu WTI', unit: 'USD', group: 'oil', riseIsPressure: true },
  { id: 'BRENT', label: 'Dầu Brent', unit: 'USD', group: 'oil', riseIsPressure: true },
  { id: 'GOLD', label: 'Vàng', unit: 'USD', group: 'gold', riseIsPressure: false },
  { id: 'US2Y', label: 'Mỹ 2 năm', unit: '%', group: 'us', riseIsPressure: true },
  { id: 'US10Y', label: 'Mỹ 10 năm', unit: '%', group: 'us', riseIsPressure: true },
  { id: 'US30Y', label: 'Mỹ 30 năm', unit: '%', group: 'us', riseIsPressure: true },
  { id: 'JP10Y', label: 'Nhật 10 năm', unit: '%', group: 'jp', riseIsPressure: true },
  { id: 'JP30Y', label: 'Nhật 30 năm', unit: '%', group: 'jp', riseIsPressure: true },
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

// ---------- U.S. policy rate & economy (monthly, FRED) ----------

export const FED_LOW = 'US_FED_LOW';
export const FED_HIGH = 'US_FED_HIGH';

export interface MacroInfo {
  readonly id: string;
  readonly label: string;
  readonly color: string;
}

// Mid-tone colors readable on light and dark backgrounds.
export const MACRO_SERIES: readonly MacroInfo[] = [
  { id: 'US_CPI_YOY', label: 'CPI', color: '#dc2626' },
  { id: 'US_PCE_YOY', label: 'PCE', color: '#d97706' },
  { id: 'US_PPI_YOY', label: 'PPI', color: '#7c3aed' },
  { id: 'US_UNRATE', label: 'Thất nghiệp', color: '#059669' },
];

export const MACRO_SERIES_IDS: readonly string[] = [FED_LOW, FED_HIGH, ...MACRO_SERIES.map((s) => s.id)];

export type MacroRow = { date: string; fed?: [number, number] } & Record<string, number | string | [number, number] | undefined>;

/** One row per month: the FED target range as a [low, high] band plus each indicator. */
export function macroRows(points: readonly MarketPoint[]): MacroRow[] {
  const byDate = new Map<string, Record<string, number>>();
  for (const p of points) {
    if (!MACRO_SERIES_IDS.includes(p.series)) continue;
    byDate.set(p.date, { ...byDate.get(p.date), [p.series]: p.value });
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => {
      const { [FED_LOW]: low, [FED_HIGH]: high, ...rest } = values;
      return { date, ...rest, ...(low !== undefined && high !== undefined ? { fed: [low, high] as [number, number] } : {}) };
    });
}

export interface MacroLatest {
  readonly label: string;
  /** Month of the observation (YYYY-MM-01). */
  readonly date: string;
  readonly text: string;
  /** Change from the previous month in percentage points; null for the FED range or a single observation. */
  readonly change: number | null;
}

/** Latest month of each indicator, e.g. "CPI T9/2026: 3,7%". */
export function macroLatest(points: readonly MarketPoint[], formatPercent: (value: number) => string): MacroLatest[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const last = (id: string) => sorted.filter((p) => p.series === id).slice(-2);
  const result: MacroLatest[] = [];
  const [low] = last(FED_LOW).slice(-1);
  const [high] = last(FED_HIGH).slice(-1);
  if (low && high) result.push({ label: 'Lãi suất FED', date: high.date, text: `${formatPercent(low.value)}–${formatPercent(high.value)}`, change: null });
  for (const info of MACRO_SERIES) {
    const [previous, current] = last(info.id).length === 2 ? last(info.id) : [undefined, last(info.id)[0]];
    if (!current) continue;
    result.push({ label: info.label, date: current.date, text: formatPercent(current.value), change: previous ? current.value - previous.value : null });
  }
  return result;
}
