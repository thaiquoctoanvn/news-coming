import type { RawItem } from '../types.ts';
import { parseFeed } from './rss.ts';

const FRESHNESS = 'when:1d';

export function googleNewsUrl(query: string): string {
  const q = encodeURIComponent(`${query} ${FRESHNESS}`);
  return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
}

/**
 * Google News titles end with " - Publisher" and the description only repeats the title,
 * so the suffix is stripped and the description dropped.
 */
export function parseGoogleNews(xml: string): RawItem[] {
  return parseFeed(xml).map(({ description: _description, ...item }) => ({
    ...item,
    title: stripPublisherSuffix(item.title, item.publisher),
  }));
}

export function stripPublisherSuffix(title: string, publisher: string | undefined): string {
  if (!publisher) return title;
  const suffix = ` - ${publisher}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title;
}
