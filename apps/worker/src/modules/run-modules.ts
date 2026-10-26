import { errorMessage, log } from '../log.ts';
import {
  AUCTIONS_URL, BOJ_URL, FOMC_URL, FRED_RELEASES, fredReleaseDatesUrl, parseBojSchedule, parseFomcCalendar,
  parseFredReleaseDates, parseUpcomingAuctions,
} from './calendar.ts';
import { parseEiaSpot, parseFredObservations, parseJgbCsv, parseTreasuryYieldXml, parseYahooChart } from './market.ts';
import { dateIn } from './time.ts';
import type { CalendarEvent, DataModule, MarketPoint, ModuleContext, ModuleStore } from './types.ts';

// Runs the enabled data modules of a topic. A failing module never stops the edition:
// its error is reported in the run stats and the previous data stays in place.

const EVENTS_PAST_DAYS = 3;
const EVENTS_AHEAD_DAYS = 45;
const DAY_MS = 86_400_000;
// Daily closes fetched per run; a module without any data yet gets one year so its chart starts filled.
const RECENT_RANGE = '10d';
const BACKFILL_RANGE = '1y';

export interface ModuleResult {
  readonly rows: number;
  readonly warnings: readonly string[];
  readonly error: string | null;
}

interface ConnectorOutput {
  readonly points?: readonly MarketPoint[];
  readonly events?: readonly CalendarEvent[];
  readonly warnings: string[];
}

type SeriesMap = Readonly<Record<string, string>>;

export async function runDataModules(topicId: string, store: ModuleStore, ctx: ModuleContext): Promise<Record<string, ModuleResult>> {
  const results: Record<string, ModuleResult> = {};
  for (const module of await store.loadDataModules(topicId)) {
    try {
      const output = await runConnector(module, ctx);
      if (output.points) await store.upsertMarketData(topicId, module.id, output.points);
      if (output.events) await store.upsertEvents(topicId, module.id, output.events);
      results[module.id] = { rows: (output.points?.length ?? 0) + (output.events?.length ?? 0), warnings: output.warnings, error: null };
    } catch (error: unknown) {
      results[module.id] = { rows: 0, warnings: [], error: errorMessage(error) };
      log.warn('data module failed', { module: module.id, error: errorMessage(error) });
    }
  }
  return results;
}

async function runConnector(module: DataModule, ctx: ModuleContext): Promise<ConnectorOutput> {
  const config = module.config as { series?: SeriesMap; fallback?: { series?: SeriesMap }; feeds?: string[] };
  switch (module.connector) {
    case 'yahoo_chart':
      return withFallback(() => yahoo(config.series ?? {}, ctx, module.hasMarketData === false ? BACKFILL_RANGE : RECENT_RANGE), config.fallback?.series, (s) => eia(s, ctx), 'EIA_API_KEY', ctx.eiaApiKey);
    case 'treasury_yield_curve':
      return withFallback(() => treasuryYields(config.series ?? {}, ctx), config.fallback?.series, (s) => fred(s, ctx), 'FRED_API_KEY', ctx.fredApiKey);
    case 'mof_jgb':
      return { points: parseJgbCsv(await ctx.fetchText('https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv'), config.series ?? {}), warnings: [] };
    case 'macro_calendar':
      return calendar(config.feeds ?? [], ctx);
    case 'fred_series':
      return fredSeries(module.config as FredSeriesConfig, ctx);
    default:
      throw new Error(`Unknown connector "${module.connector}"`);
  }
}

async function withFallback(
  primary: () => Promise<MarketPoint[]>,
  fallbackSeries: SeriesMap | undefined,
  fallback: (series: SeriesMap) => Promise<MarketPoint[]>,
  keyName: string,
  key: string | undefined,
): Promise<ConnectorOutput> {
  try {
    return { points: await primary(), warnings: [] };
  } catch (error: unknown) {
    if (!fallbackSeries || !key) throw new Error(`${errorMessage(error)}; no fallback (${keyName} not set)`);
    return { points: await fallback(fallbackSeries), warnings: [`primary failed, used fallback: ${errorMessage(error)}`] };
  }
}

async function yahoo(series: SeriesMap, ctx: ModuleContext, range: string): Promise<MarketPoint[]> {
  const points: MarketPoint[] = [];
  for (const [name, symbol] of Object.entries(series)) {
    const json = await ctx.fetchText(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`);
    points.push(...parseYahooChart(json, name));
  }
  return points;
}

async function eia(series: SeriesMap, ctx: ModuleContext): Promise<MarketPoint[]> {
  const points: MarketPoint[] = [];
  for (const [name, code] of Object.entries(series)) {
    const url = `https://api.eia.gov/v2/petroleum/pri/spt/data/?api_key=${ctx.eiaApiKey}&frequency=daily&data[0]=value`
      + `&facets[series][]=${code}&sort[0][column]=period&sort[0][direction]=desc&length=10`;
    points.push(...parseEiaSpot(await ctx.fetchText(url), name));
  }
  return points;
}

async function treasuryYields(fields: SeriesMap, ctx: ModuleContext): Promise<MarketPoint[]> {
  const year = Number(dateIn(ctx.now, 'America/New_York').slice(0, 4));
  const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=${year}`;
  const points = parseTreasuryYieldXml(await ctx.fetchText(url), fields);
  if (points.length === 0) throw new Error(`Treasury yield curve ${year} has no data`);
  return points.slice(-10 * Object.keys(fields).length);
}

async function fred(series: SeriesMap, ctx: ModuleContext): Promise<MarketPoint[]> {
  const points: MarketPoint[] = [];
  for (const [name, id] of Object.entries(series)) {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${ctx.fredApiKey}&file_type=json&sort_order=desc&limit=10`;
    points.push(...parseFredObservations(await ctx.fetchText(url), name));
  }
  return points;
}

/** One FRED series; `units: "pc1"` asks FRED for the % change from a year ago, `frequency`/`aggregation` resample it. */
export interface FredSeriesSpec {
  readonly id: string;
  readonly units?: string;
  readonly frequency?: string;
  readonly aggregation?: string;
}

interface FredSeriesConfig {
  readonly series?: Readonly<Record<string, FredSeriesSpec>>;
  /** History kept for the chart; each run refetches the whole window, so FRED revisions are picked up. */
  readonly months?: number;
}

const DEFAULT_FRED_MONTHS = 36;

export function fredObservationsUrl(spec: FredSeriesSpec, apiKey: string, start: string): string {
  const params = new URLSearchParams({ series_id: spec.id, api_key: apiKey, file_type: 'json', observation_start: start });
  if (spec.units) params.set('units', spec.units);
  if (spec.frequency) params.set('frequency', spec.frequency);
  if (spec.aggregation) params.set('aggregation_method', spec.aggregation);
  return `https://api.stlouisfed.org/fred/series/observations?${params.toString()}`;
}

/** Generic FRED connector (monthly macro series). A failing series leaves a warning, the others still update. */
async function fredSeries(config: FredSeriesConfig, ctx: ModuleContext): Promise<ConnectorOutput> {
  if (!ctx.fredApiKey) throw new Error('FRED_API_KEY not set');
  const months = config.months ?? DEFAULT_FRED_MONTHS;
  const start = `${dateIn(new Date(ctx.now.getTime() - (months + 1) * 31 * DAY_MS), 'America/New_York').slice(0, 7)}-01`;
  const points: MarketPoint[] = [];
  const warnings: string[] = [];
  for (const [name, spec] of Object.entries(config.series ?? {})) {
    try {
      points.push(...parseFredObservations(await ctx.fetchText(fredObservationsUrl(spec, ctx.fredApiKey, start)), name));
    } catch (error: unknown) {
      warnings.push(`${name}: ${errorMessage(error)}`);
    }
  }
  if (points.length === 0 && warnings.length > 0) throw new Error(warnings.join(' | '));
  return { points, warnings };
}

/** Each feed is independent: one failing source leaves a warning, the others still update. */
async function calendar(feeds: readonly string[], ctx: ModuleContext): Promise<ConnectorOutput> {
  const events: CalendarEvent[] = [];
  const warnings: string[] = [];
  const attempt = async (name: string, load: () => Promise<CalendarEvent[]>): Promise<void> => {
    try {
      events.push(...(await load()));
    } catch (error: unknown) {
      warnings.push(`${name}: ${errorMessage(error)}`);
    }
  };
  const year = Number(dateIn(ctx.now, 'America/New_York').slice(0, 4));

  if (feeds.includes('fomc')) {
    await attempt('fomc', async () => {
      const html = await ctx.fetchText(FOMC_URL);
      return [...parseFomcCalendar(html, year), ...parseFomcCalendar(html, year + 1)];
    });
  }
  if (feeds.includes('boj')) await attempt('boj', async () => parseBojSchedule(await ctx.fetchText(BOJ_URL)));
  if (feeds.includes('treasury_auctions')) await attempt('treasury_auctions', async () => parseUpcomingAuctions(await ctx.fetchText(AUCTIONS_URL)));
  // "bls"/"bea" releases come from FRED's release calendar (bls.gov blocks automated access).
  if (feeds.some((f) => f === 'bls' || f === 'bea' || f === 'fred_releases')) {
    if (!ctx.fredApiKey) {
      warnings.push('economic releases skipped: FRED_API_KEY not set');
    } else {
      const from = dateIn(new Date(ctx.now.getTime() - EVENTS_PAST_DAYS * DAY_MS), 'America/New_York');
      for (const release of FRED_RELEASES) {
        await attempt(release.kind, async () => parseFredReleaseDates(await ctx.fetchText(fredReleaseDatesUrl(release, ctx.fredApiKey ?? '', from)), release));
      }
    }
  }

  const from = ctx.now.getTime() - EVENTS_PAST_DAYS * DAY_MS;
  const to = ctx.now.getTime() + EVENTS_AHEAD_DAYS * DAY_MS;
  const inWindow = events.filter((e) => e.startsAt.getTime() >= from && e.startsAt.getTime() <= to);
  if (inWindow.length === 0 && warnings.length > 0) throw new Error(warnings.join(' | '));
  return { events: inWindow, warnings };
}
