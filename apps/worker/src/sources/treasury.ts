import type { RawItem } from '../types.ts';
import { cleanText, parseDate } from './text.ts';

// home.treasury.gov/news/press-releases renders the latest releases server-side as
// <time datetime=…> … <a href=/news/press-releases/sb0657/>Title</a> blocks.

const BASE_URL = 'https://home.treasury.gov';
const ENTRY = /<time\s+datetime=["']?([^"'\s>]+)["']?[^>]*>[\s\S]*?<a\s+href=["']?(\/news\/press-releases\/[a-z]{2}\d+\/?)["']?[^>]*>([\s\S]*?)<\/a>/gi;

export function parseTreasuryPressReleases(html: string): RawItem[] {
  const items: RawItem[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(ENTRY)) {
    const [, datetime, path, rawTitle] = match;
    const title = cleanText(rawTitle);
    if (!path || !title || seen.has(path)) continue;
    seen.add(path);
    const publishedAt = parseDate(datetime);
    items.push({
      url: `${BASE_URL}${path}`,
      title,
      publisher: 'U.S. Treasury',
      publisherDomain: 'treasury.gov',
      ...(publishedAt ? { publishedAt } : {}),
    });
  }
  if (items.length === 0) throw new Error('No press releases found — page layout may have changed');
  return items;
}
