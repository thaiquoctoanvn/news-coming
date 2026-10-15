import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import type { FetchLike } from './ai/providers.ts';

// Gets readable article text for summaries. Google News links are JavaScript redirects, so they
// are first decoded to the publisher URL through Google's own (unofficial) decoding endpoint.
// Paywalled publishers (Reuters, WSJ…) answer 401/403; callers then fall back to other outlets
// of the same story, and finally to the title/description.

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const TIMEOUT_MS = 15_000;
const MIN_ARTICLE_CHARS = 300;
export const MAX_ARTICLE_CHARS = 3_000;

export function isGoogleNewsUrl(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    return hostname === 'news.google.com' && /\/articles\/[^/]+$/.test(pathname);
  } catch {
    return false;
  }
}

/** Publisher URL behind a Google News article link, or null if Google does not reveal it. */
export async function decodeGoogleNewsUrl(url: string, fetchImpl: FetchLike = fetch): Promise<string | null> {
  const id = new URL(url).pathname.split('/').pop() ?? '';
  const page = await fetchText(`https://news.google.com/articles/${id}`, fetchImpl);
  const signature = page?.match(/data-n-a-sg="([^"]+)"/)?.[1];
  const timestamp = page?.match(/data-n-a-ts="([^"]+)"/)?.[1];
  if (!signature || !timestamp) return null;

  const request = JSON.stringify([
    'garturlreq',
    [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1], 'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
    id,
    Number(timestamp),
    signature,
  ]);
  const response = await fetchImpl('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': BROWSER_USER_AGENT },
    body: `f.req=${encodeURIComponent(JSON.stringify([[['Fbv4je', request, null, 'generic']]]))}`,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return null;
  return parseBatchExecuteUrl(await response.text());
}

export function parseBatchExecuteUrl(text: string): string | null {
  try {
    const envelope = JSON.parse(text.split('\n\n')[1] ?? '') as unknown[][];
    const payload = JSON.parse(String(envelope[0]?.[2])) as unknown[];
    const url = payload[1];
    return typeof url === 'string' && url.startsWith('http') ? url : null;
  } catch {
    return null;
  }
}

/** Main text of an article page, or null when blocked, too short, or not HTML. */
export async function extractArticleText(url: string, fetchImpl: FetchLike = fetch): Promise<string | null> {
  const html = await fetchText(url, fetchImpl);
  if (!html) return null;
  return readableText(html);
}

export function readableText(html: string): string | null {
  const { document } = parseHTML(html);
  const article = new Readability(document as never).parse();
  const text = (article?.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (text.length >= MIN_ARTICLE_CHARS) return text.slice(0, MAX_ARTICLE_CHARS);
  const meta = document.querySelector('meta[property="og:description"], meta[name="description"]')?.getAttribute('content');
  return meta && meta.trim().length > 40 ? meta.trim() : null;
}

async function fetchText(url: string, fetchImpl: FetchLike): Promise<string | null> {
  try {
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}
