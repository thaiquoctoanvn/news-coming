import { BROWSER_USER_AGENT, fetchText } from '../http.ts';
import type { RawItem, Source } from '../types.ts';
import { parseEdgarSubmissions } from './edgar.ts';
import { googleNewsUrl, parseGoogleNews } from './google-news.ts';
import { gdeltUrl, parseBinanceAnnouncements, parseGdelt } from './json-sources.ts';
import { parseFeed } from './rss.ts';
import { hostOf } from './text.ts';
import { parseTreasuryPressReleases } from './treasury.ts';

export const MAX_ITEMS_PER_SOURCE = 50;

export interface FetchContext {
  /** SEC requires a User-Agent with a contact email; EDGAR sources fail without it. */
  readonly secUserAgent: string | undefined;
}

export async function fetchSource(source: Source, context: FetchContext): Promise<RawItem[]> {
  const items = await fetchByKind(source, context);
  return items.slice(0, MAX_ITEMS_PER_SOURCE);
}

async function fetchByKind(source: Source, context: FetchContext): Promise<RawItem[]> {
  switch (source.kind) {
    case 'rss':
      return parseFeed(await fetchText(requireUrl(source)));
    case 'google_news':
      return parseGoogleNews(await fetchText(googleNewsUrl(requireQuery(source))));
    case 'gdelt':
      return parseGdelt(await fetchText(gdeltUrl(requireQuery(source))));
    case 'edgar': {
      if (!context.secUserAgent) throw new Error('SEC_USER_AGENT is not set');
      const json = await fetchText(requireUrl(source), {
        headers: { 'User-Agent': context.secUserAgent, Accept: 'application/json' },
      });
      return parseEdgarSubmissions(json);
    }
    case 'html':
      return fetchHtml(source);
    case 'json':
      return fetchJson(source);
  }
}

async function fetchHtml(source: Source): Promise<RawItem[]> {
  const url = requireUrl(source);
  if (hostOf(url) === 'home.treasury.gov') {
    return parseTreasuryPressReleases(await fetchText(url, { headers: { 'User-Agent': BROWSER_USER_AGENT } }));
  }
  throw new Error(`No HTML parser for ${hostOf(url) ?? url}`);
}

async function fetchJson(source: Source): Promise<RawItem[]> {
  const url = requireUrl(source);
  if (hostOf(url) === 'binance.com') return parseBinanceAnnouncements(await fetchText(url));
  throw new Error(`No JSON parser for ${hostOf(url) ?? url}`);
}

function requireUrl(source: Source): string {
  if (!source.url) throw new Error(`Source "${source.name}" has no url`);
  return source.url;
}

function requireQuery(source: Source): string {
  if (!source.query) throw new Error(`Source "${source.name}" has no query`);
  return source.query;
}
