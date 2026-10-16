import { z } from 'zod';
import type { MarketPoint } from './types.ts';
import { dateIn, isoDate } from './time.ts';

// Parsers for market series. Each returns the latest observations; the store upserts by date.

const yahooSchema = z.object({
  chart: z.object({
    result: z.array(z.object({
      meta: z.object({ exchangeTimezoneName: z.string() }),
      timestamp: z.array(z.number()).default([]),
      indicators: z.object({ quote: z.array(z.object({ close: z.array(z.number().nullable()) })) }),
    })).min(1),
  }),
});

/** Yahoo Finance chart API (unofficial): daily closes of one symbol. */
export function parseYahooChart(json: string, series: string): MarketPoint[] {
  const result = yahooSchema.parse(JSON.parse(json)).chart.result[0]!;
  const closes = result.indicators.quote[0]?.close ?? [];
  return result.timestamp.flatMap((ts, i) => {
    const value = closes[i];
    if (value === null || value === undefined) return [];
    const obsDate = dateIn(new Date(ts * 1000), result.meta.exchangeTimezoneName);
    return [{ series, obsDate, value: round(value, 2), source: 'yahoo' }];
  });
}

/** U.S. Treasury daily par yield curve XML. `fields` maps series → XML field, e.g. US10Y → BC_10YEAR. */
export function parseTreasuryYieldXml(xml: string, fields: Readonly<Record<string, string>>): MarketPoint[] {
  const points: MarketPoint[] = [];
  for (const [, block = ''] of xml.matchAll(/<m:properties>([\s\S]*?)<\/m:properties>/g)) {
    const date = block.match(/<d:NEW_DATE[^>]*>(\d{4}-\d{2}-\d{2})/)?.[1];
    if (!date) continue;
    for (const [series, field] of Object.entries(fields)) {
      const raw = block.match(new RegExp(`<d:${field}[^>]*>([\\d.]+)<`))?.[1];
      if (raw) points.push({ series, obsDate: date, value: Number(raw), source: 'treasury' });
    }
  }
  return points;
}

/** Japan MOF JGB yields CSV ("Date,1Y,…,10Y,…" then "2026/10/15,1.652,…"). `columns` maps series → header. */
export function parseJgbCsv(csv: string, columns: Readonly<Record<string, string>>): MarketPoint[] {
  const lines = csv.split(/\r?\n/);
  const header = lines.find((line) => line.startsWith('Date,'))?.split(',') ?? [];
  const points: MarketPoint[] = [];
  for (const line of lines) {
    const cells = line.split(',');
    const date = cells[0]?.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (!date) continue;
    for (const [series, column] of Object.entries(columns)) {
      const value = Number(cells[header.indexOf(column)]);
      if (header.includes(column) && Number.isFinite(value) && cells[header.indexOf(column)] !== '') {
        points.push({ series, obsDate: isoDate(Number(date[1]), Number(date[2]), Number(date[3])), value, source: 'mof' });
      }
    }
  }
  return points;
}

const fredObservationsSchema = z.object({ observations: z.array(z.object({ date: z.string(), value: z.string() })) });

/** FRED series observations (missing values are "."). */
export function parseFredObservations(json: string, series: string): MarketPoint[] {
  return fredObservationsSchema.parse(JSON.parse(json)).observations
    .filter((o) => o.value !== '.' && Number.isFinite(Number(o.value)))
    .map((o) => ({ series, obsDate: o.date, value: Number(o.value), source: 'fred' }));
}

const eiaSchema = z.object({ response: z.object({ data: z.array(z.object({ period: z.string(), value: z.coerce.number() })) }) });

/** EIA API v2 daily spot prices. */
export function parseEiaSpot(json: string, series: string): MarketPoint[] {
  return eiaSchema.parse(JSON.parse(json)).response.data.map((d) => ({ series, obsDate: d.period, value: d.value, source: 'eia' }));
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
