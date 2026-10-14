// Checks that every candidate source in DESIGN.md §7 is reachable and returns the expected format.
// Usage: node apps/worker/scripts/verify-sources.ts
// Optional env: FRED_API_KEY, EIA_API_KEY, SEC_USER_AGENT

type Format = 'rss' | 'json' | 'csv' | 'xml' | 'ics' | 'html';

interface Candidate {
  readonly group: string;
  readonly name: string;
  readonly url: string;
  readonly format: Format;
  readonly headers?: Readonly<Record<string, string>>;
  readonly requiresEnv?: string;
}

interface CheckResult {
  readonly candidate: Candidate;
  readonly ok: boolean;
  readonly detail: string;
}

const TIMEOUT_MS = 20_000;
const YEAR = new Date().getUTCFullYear();
const DEFAULT_UA = 'news-coming source check (+https://github.com/thaiquoctoanvn/news-coming)';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const googleNews = (query: string): string =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:1d`)}&hl=en-US&gl=US&ceid=US:en`;

// SEC rejects requests whose User-Agent has no contact email (HTTP 403).
const secHeaders = { 'User-Agent': process.env.SEC_USER_AGENT ?? '', Accept: 'application/json' };
const SEC_CIKS = {
  Strategy: '0001050446',
  BitMine: '0001829311',
  Coinbase: '0001679788',
  Circle: '0001876042',
  BlackRock: '0002012383',
} as const;

const CANDIDATES: readonly Candidate[] = [
  // News — official
  { group: 'fed', name: 'Fed press (all)', url: 'https://www.federalreserve.gov/feeds/press_all.xml', format: 'rss' },
  { group: 'fed', name: 'Fed press (monetary)', url: 'https://www.federalreserve.gov/feeds/press_monetary.xml', format: 'rss' },
  { group: 'fed', name: 'Fed speeches', url: 'https://www.federalreserve.gov/feeds/speeches.xml', format: 'rss' },
  { group: 'treasury', name: 'Treasury press releases (HTML)', url: 'https://home.treasury.gov/news/press-releases', format: 'html', headers: { 'User-Agent': BROWSER_UA } },
  { group: 'yield_jp', name: 'BOJ what\'s new RSS', url: 'https://www.boj.or.jp/en/rss/whatsnew.xml', format: 'rss' },
  // News — SEC EDGAR
  ...Object.entries(SEC_CIKS).map(([name, cik]): Candidate => ({
    group: 'entity', name: `EDGAR submissions: ${name}`, url: `https://data.sec.gov/submissions/CIK${cik}.json`,
    format: 'json', headers: secHeaders, requiresEnv: 'SEC_USER_AGENT',
  })),
  // News — media / aggregators
  { group: 'crypto', name: 'CoinDesk RSS', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', format: 'rss' },
  { group: 'crypto', name: 'The Block RSS', url: 'https://www.theblock.co/rss.xml', format: 'rss' },
  { group: 'crypto', name: 'Cointelegraph RSS', url: 'https://cointelegraph.com/rss', format: 'rss' },
  { group: 'oil', name: 'Google News: oil', url: googleNews('oil prices OR brent OR WTI OR OPEC'), format: 'rss' },
  { group: 'fed', name: 'Google News: Fed', url: googleNews('"Federal Reserve" OR FOMC OR Powell'), format: 'rss' },
  { group: 'entity', name: 'Google News: Strategy', url: googleNews('"Strategy" MSTR bitcoin'), format: 'rss' },
  // GDELT allows 1 request / 5 s per IP and often answers 429; treat as optional.
  { group: 'geo', name: 'GDELT DOC API', url: 'https://api.gdeltproject.org/api/v2/doc/doc?query=%22oil%20supply%22%20sanctions&mode=artlist&format=json&maxrecords=10&timespan=1d', format: 'json' },
  // Newsrooms (Coinbase blog: 403, Circle blog: no RSS — covered by Google News + EDGAR instead)
  { group: 'entity', name: 'Binance announcements (unofficial JSON)', url: 'https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&pageNo=1&pageSize=10', format: 'json' },
  // Data modules
  { group: 'us_yields', name: 'Treasury daily yield curve XML', url: `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=${YEAR}`, format: 'xml' },
  { group: 'us_yields', name: 'FRED DGS10', url: `https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&sort_order=desc&limit=5&file_type=json&api_key=${process.env.FRED_API_KEY ?? ''}`, format: 'json', requiresEnv: 'FRED_API_KEY' },
  { group: 'jp_yields', name: 'MOF Japan JGB CSV (current)', url: 'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv', format: 'csv' },
  { group: 'oil_price', name: 'Yahoo chart CL=F / WTI (unofficial)', url: 'https://query1.finance.yahoo.com/v8/finance/chart/CL=F?range=5d&interval=1d', format: 'json', headers: { 'User-Agent': BROWSER_UA } },
  { group: 'oil_price', name: 'Yahoo chart BZ=F / Brent (unofficial)', url: 'https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?range=5d&interval=1d', format: 'json', headers: { 'User-Agent': BROWSER_UA } },
  { group: 'oil_price', name: 'EIA WTI spot (RWTC)', url: `https://api.eia.gov/v2/petroleum/pri/spt/data/?api_key=${process.env.EIA_API_KEY ?? ''}&frequency=daily&data[0]=value&facets[series][]=RWTC&sort[0][column]=period&sort[0][direction]=desc&length=5`, format: 'json', requiresEnv: 'EIA_API_KEY' },
  // Calendar module
  { group: 'calendar', name: 'FOMC calendar (HTML)', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', format: 'html' },
  { group: 'calendar', name: 'BLS release calendar ICS', url: 'https://www.bls.gov/schedule/news_release/bls.ics', format: 'ics', headers: { 'User-Agent': BROWSER_UA } },
  { group: 'calendar', name: 'BEA release schedule (HTML)', url: 'https://www.bea.gov/news/schedule', format: 'html', headers: { 'User-Agent': BROWSER_UA } },
  { group: 'calendar', name: 'Treasury FiscalData auctions', url: 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query?sort=-auction_date&page[size]=5', format: 'json' },
];

function describeBody(format: Format, body: string): { ok: boolean; detail: string } {
  switch (format) {
    case 'rss': {
      const items = (body.match(/<(item|entry)[\s>]/g) ?? []).length;
      return { ok: items > 0, detail: `${items} items` };
    }
    case 'json': {
      try {
        const parsed: unknown = JSON.parse(body);
        const size = Array.isArray(parsed) ? parsed.length : Object.keys(parsed as object).length;
        return { ok: size > 0, detail: `json, ${size} top-level entries` };
      } catch {
        return { ok: false, detail: `not json: ${body.slice(0, 80).replace(/\s+/g, ' ')}` };
      }
    }
    case 'csv': {
      const lines = body.split(/\r?\n/).filter((l) => l.includes(','));
      return { ok: lines.length > 1, detail: `${lines.length} csv lines, last: ${lines.at(-1)?.slice(0, 60) ?? ''}` };
    }
    case 'xml': {
      const entries = (body.match(/<(entry|m:properties)[\s>]/g) ?? []).length;
      return { ok: entries > 0, detail: `${entries} xml entries` };
    }
    case 'ics': {
      const events = (body.match(/BEGIN:VEVENT/g) ?? []).length;
      return { ok: events > 0, detail: `${events} events` };
    }
    case 'html':
      return { ok: body.length > 5_000, detail: `${Math.round(body.length / 1024)} KB html` };
  }
}

async function check(candidate: Candidate): Promise<CheckResult> {
  if (candidate.requiresEnv && !process.env[candidate.requiresEnv]) {
    return { candidate, ok: false, detail: `SKIPPED: set ${candidate.requiresEnv}` };
  }
  try {
    const response = await fetch(candidate.url, {
      headers: { 'User-Agent': DEFAULT_UA, ...candidate.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await response.text();
    if (!response.ok) {
      return { candidate, ok: false, detail: `HTTP ${response.status}` };
    }
    const { ok, detail } = describeBody(candidate.format, body);
    return { candidate, ok, detail };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { candidate, ok: false, detail: `ERROR ${message}` };
  }
}

async function main(): Promise<void> {
  const results = await Promise.all(CANDIDATES.map(check));
  const lines = results.map((r) => `${r.ok ? 'OK  ' : 'FAIL'}  [${r.candidate.group}] ${r.candidate.name} — ${r.detail}`);
  process.stdout.write(`${lines.join('\n')}\n`);
  const failed = results.filter((r) => !r.ok).length;
  process.stdout.write(`\n${results.length - failed}/${results.length} sources OK\n`);
  process.exitCode = failed > 0 ? 1 : 0;
}

await main();
