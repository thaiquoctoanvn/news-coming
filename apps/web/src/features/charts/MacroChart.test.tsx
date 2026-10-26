import { describe, expect, test } from 'vitest';
import { macroLatest, macroRows } from '../../lib/market.ts';
import { monthLabel } from './MacroChart.tsx';

const points = [
  { series: 'US_FED_LOW', date: '2026-08-01', value: 4.5 },
  { series: 'US_FED_HIGH', date: '2026-08-01', value: 4.75 },
  { series: 'US_FED_LOW', date: '2026-09-01', value: 4.75 },
  { series: 'US_FED_HIGH', date: '2026-09-01', value: 5 },
  { series: 'US_CPI_YOY', date: '2026-08-01', value: 3.6 },
  { series: 'US_CPI_YOY', date: '2026-09-01', value: 3.7 },
  { series: 'US_UNRATE', date: '2026-09-01', value: 4.3 },
  { series: 'WTI', date: '2026-09-01', value: 95 },
];

describe('U.S. macro chart data', () => {
  test('one row per month with the FED range as a band; other series ignored', () => {
    expect(macroRows(points)).toEqual([
      { date: '2026-08-01', fed: [4.5, 4.75], US_CPI_YOY: 3.6 },
      { date: '2026-09-01', fed: [4.75, 5], US_CPI_YOY: 3.7, US_UNRATE: 4.3 },
    ]);
  });

  test('latest month of each indicator with its month and change', () => {
    expect(macroLatest(points, (v) => `${v}%`)).toEqual([
      { label: 'Lãi suất FED', date: '2026-09-01', text: '4.75%–5%', change: null },
      { label: 'CPI', date: '2026-09-01', text: '3.7%', change: expect.closeTo(0.1) },
      { label: 'Thất nghiệp', date: '2026-09-01', text: '4.3%', change: null },
    ]);
  });

  test('month labels', () => {
    expect(monthLabel('2026-09-01')).toBe('T9/2026');
    expect(monthLabel('2026-09-01', true)).toBe('T9/26');
  });
});
