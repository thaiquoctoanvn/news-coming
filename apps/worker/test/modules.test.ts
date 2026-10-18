import { describe, expect, test } from 'vitest';
import {
  FRED_RELEASES, parseBojSchedule, parseFomcCalendar, parseFredReleaseDates, parseUpcomingAuctions,
} from '../src/modules/calendar.ts';
import { parseFredObservations, parseJgbCsv, parseTreasuryYieldXml, parseYahooChart } from '../src/modules/market.ts';
import { runDataModules } from '../src/modules/run-modules.ts';
import { dateIn, zonedTime } from '../src/modules/time.ts';
import type { CalendarEvent, MarketPoint, ModuleContext, ModuleStore } from '../src/modules/types.ts';

describe('time helpers', () => {
  test('converts local wall-clock times across DST', () => {
    expect(zonedTime('2026-10-28', '14:00', 'America/New_York').toISOString()).toBe('2026-10-28T18:00:00.000Z'); // EDT
    expect(zonedTime('2026-12-09', '14:00', 'America/New_York').toISOString()).toBe('2026-12-09T19:00:00.000Z'); // EST
    expect(zonedTime('2026-10-30', '12:00', 'Asia/Tokyo').toISOString()).toBe('2026-10-30T03:00:00.000Z');
    expect(dateIn(new Date('2026-10-15T23:30:00Z'), 'Asia/Ho_Chi_Minh')).toBe('2026-10-16');
  });
});

describe('market parsers', () => {
  test('Yahoo chart closes become dated points in the exchange time zone, skipping gaps', () => {
    const json = JSON.stringify({ chart: { result: [{
      meta: { exchangeTimezoneName: 'America/New_York' },
      timestamp: [1791777600, 1791864000, 1791950400],
      indicators: { quote: [{ close: [93.739997, null, 95.089996] }] },
    }] } });

    expect(parseYahooChart(json, 'WTI')).toEqual([
      { series: 'WTI', obsDate: '2026-10-12', value: 93.74, source: 'yahoo' },
      { series: 'WTI', obsDate: '2026-10-14', value: 95.09, source: 'yahoo' },
    ]);
  });

  test('Treasury yield curve XML', () => {
    const xml = `<entry><m:properties><d:NEW_DATE m:type="Edm.DateTime">2026-10-15T00:00:00</d:NEW_DATE>
      <d:BC_2YEAR m:type="Edm.Double">4.77</d:BC_2YEAR><d:BC_10YEAR m:type="Edm.Double">5.10</d:BC_10YEAR></m:properties></entry>`;

    expect(parseTreasuryYieldXml(xml, { US2Y: 'BC_2YEAR', US10Y: 'BC_10YEAR', US30Y: 'BC_30YEAR' })).toEqual([
      { series: 'US2Y', obsDate: '2026-10-15', value: 4.77, source: 'treasury' },
      { series: 'US10Y', obsDate: '2026-10-15', value: 5.1, source: 'treasury' },
    ]);
  });

  test('MOF JGB CSV skips notes and empty cells', () => {
    const csv = [
      'Interest Rate (October 2026),,,(Unit : %)',
      'Date,1Y,10Y,30Y',
      '2026/10/1,1.668,3.092,',
      '2026/10/15,1.652,2.948,4.024',
      ',,,',
      '"  ※If you cannot download the latest csv data, please clear the cache.",,,',
    ].join('\r\n');

    expect(parseJgbCsv(csv, { JP10Y: '10Y', JP30Y: '30Y' })).toEqual([
      { series: 'JP10Y', obsDate: '2026-10-01', value: 3.092, source: 'mof' },
      { series: 'JP10Y', obsDate: '2026-10-15', value: 2.948, source: 'mof' },
      { series: 'JP30Y', obsDate: '2026-10-15', value: 4.024, source: 'mof' },
    ]);
  });

  test('FRED observations drop missing values', () => {
    const json = JSON.stringify({ observations: [{ date: '2026-10-14', value: '5.19' }, { date: '2026-10-13', value: '.' }] });

    expect(parseFredObservations(json, 'US10Y')).toEqual([{ series: 'US10Y', obsDate: '2026-10-14', value: 5.19, source: 'fred' }]);
  });
});

describe('calendar parsers', () => {
  test('FOMC: decision at 2 p.m. ET on the last meeting day, including meetings across months', () => {
    const html = `<h4><a>2026 FOMC Meetings</a></h4>
      <div class="fomc-meeting__month col"><strong>October</strong></div> <div class="fomc-meeting__date col">27-28</div>
      <div class="fomc-meeting__month col"><strong>Apr/May</strong></div> <div class="fomc-meeting__date col">30-1*</div>
      <h4><a>2025 FOMC Meetings</a></h4>
      <div class="fomc-meeting__month col"><strong>June</strong></div> <div class="fomc-meeting__date col">17-18</div>`;

    expect(parseFomcCalendar(html, 2026).map((e) => e.startsAt.toISOString())).toEqual([
      '2026-10-28T18:00:00.000Z', '2026-05-01T18:00:00.000Z',
    ]);
  });

  test('BOJ: last meeting day of each row, in its year section', () => {
    const html = `<h2 id="p2026">2026</h2><table><tbody>
      <tr><td><a href="x">Oct. 29 (Thurs.), 30 (Fri.) [PDF 1KB]</a></td><td>-</td></tr>
      <tr><td>Apr. 30 (Thurs.), May 1 (Fri.)</td><td>-</td></tr>
      </tbody></table>`;

    expect(parseBojSchedule(html).map((e) => e.startsAt.toISOString())).toEqual([
      '2026-10-30T03:00:00.000Z', '2026-05-01T03:00:00.000Z',
    ]);
  });

  test('Treasury auctions: coupon notes and bonds only, reopenings rounded to their term', () => {
    const json = JSON.stringify({ data: [
      { security_type: 'Note', security_term: '5-Year', auction_date: '2026-10-22' },
      { security_type: 'Bond', security_term: '19-Year 10-Month', auction_date: '2026-10-21' },
      { security_type: 'Bill', security_term: '13-Week', auction_date: '2026-10-19' },
    ] });

    expect(parseUpcomingAuctions(json).map((e) => [e.titleVi, e.importance, e.startsAt.toISOString()])).toEqual([
      ['Đấu giá trái phiếu Kho bạc Mỹ kỳ hạn 5 năm', 2, '2026-10-22T17:00:00.000Z'],
      ['Đấu giá trái phiếu Kho bạc Mỹ kỳ hạn 20 năm', 2, '2026-10-21T17:00:00.000Z'],
    ]);
  });

  test('FRED release dates at the release time in New York', () => {
    const cpi = FRED_RELEASES.find((r) => r.kind === 'cpi')!;
    const [event] = parseFredReleaseDates(JSON.stringify({ release_dates: [{ date: '2026-11-12' }] }), cpi);

    expect(event).toMatchObject({ kind: 'cpi', importance: 3, titleVi: 'Mỹ công bố chỉ số giá tiêu dùng (CPI)' });
    expect(event?.startsAt.toISOString()).toBe('2026-11-12T13:30:00.000Z');
  });
});

describe('runDataModules', () => {
  class FakeStore implements ModuleStore {
    points: MarketPoint[] = [];
    events: CalendarEvent[] = [];
    async loadDataModules() {
      return [
        { id: 'oil_price', connector: 'yahoo_chart', config: { series: { WTI: 'CL=F' }, fallback: { connector: 'eia', series: { WTI: 'RWTC' } } } },
        { id: 'broken', connector: 'unknown', config: {} },
      ];
    }
    async upsertMarketData(_t: string, _m: string, points: readonly MarketPoint[]) { this.points.push(...points); }
    async upsertEvents(_t: string, _m: string, events: readonly CalendarEvent[]) { this.events.push(...events); }
  }

  const context = (fetchText: ModuleContext['fetchText'], eiaApiKey?: string): ModuleContext => ({
    fetchText, fredApiKey: undefined, eiaApiKey, now: new Date('2026-10-16T00:00:00Z'),
  });

  test('uses the fallback source when the primary fails, and reports failing modules without throwing', async () => {
    const store = new FakeStore();
    const fetchText = async (url: string) => {
      if (url.includes('yahoo')) throw new Error('HTTP 429');
      return JSON.stringify({ response: { data: [{ period: '2026-10-14', value: 95.1 }] } });
    };

    const results = await runDataModules('macro_finance', store, context(fetchText, 'eia-key-123456'));

    expect(store.points).toEqual([{ series: 'WTI', obsDate: '2026-10-14', value: 95.1, source: 'eia' }]);
    expect(results.oil_price).toMatchObject({ rows: 1, error: null });
    expect(results.oil_price?.warnings[0]).toContain('used fallback');
    expect(results.broken?.error).toBe('Unknown connector "unknown"');
  });

  test('a module without data fetches one year once, then only recent days', async () => {
    const urls: string[] = [];
    const yahooJson = JSON.stringify({ chart: { result: [{ meta: { exchangeTimezoneName: 'America/New_York' }, timestamp: [], indicators: { quote: [{ close: [] }] } }] } });
    const fetchText = async (url: string) => {
      urls.push(url);
      return yahooJson;
    };
    const storeWith = (hasMarketData: boolean): ModuleStore => ({
      loadDataModules: async () => [{ id: 'gold_price', connector: 'yahoo_chart', config: { series: { GOLD: 'GC=F' } }, hasMarketData }],
      upsertMarketData: async () => {},
      upsertEvents: async () => {},
    });

    await runDataModules('macro_finance', storeWith(false), context(fetchText));
    await runDataModules('macro_finance', storeWith(true), context(fetchText));

    expect(urls[0]).toContain('GC%3DF?range=1y&interval=1d');
    expect(urls[1]).toContain('GC%3DF?range=10d&interval=1d');
  });

  test('without a fallback key the module reports the primary error', async () => {
    const results = await runDataModules('macro_finance', new FakeStore(), context(async () => { throw new Error('HTTP 429'); }));

    expect(results.oil_price?.error).toBe('HTTP 429; no fallback (EIA_API_KEY not set)');
  });
});
