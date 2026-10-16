import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import type { FetchLike } from './ai/providers.ts';

// Reads article text in two free ways: the publisher page fetched directly and parsed with
// Readability, then Jina Reader (r.jina.ai, anonymous: ~20 requests/minute, and Jina may block a
// domain for anonymous users for a while) for pages that need JavaScript or refuse direct access.
// Google News links are JavaScript redirects, so they are first decoded to the publisher URL
// through Google's own (unofficial) decoding endpoint.
// The text always belongs to the article itself — callers never borrow another article's text.

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const GOOGLE_TIMEOUT_MS = 15_000;
const JINA_TIMEOUT_MS = 30_000;
const JINA_SERVER_TIMEOUT_S = '15';
/** Spacing between Jina calls to stay under 20 requests/minute. */
export const JINA_MIN_INTERVAL_MS = 3_100;
const MIN_ARTICLE_CHARS = 600;
const MIN_PARAGRAPH_CHARS = 60;
export const MAX_ARTICLE_CHARS = 8_000;

/** Paragraphs of site chrome that Jina keeps on some pages (government banners, cookie/legal notes). */
const BOILERPLATE = /official websites use|secure \.gov websites|all rights reserved|cookie|subscribe|sign up|newsletter|disclosure & polic|terms of (use|service)|privacy policy|enable javascript|could've sworn the page/i;

/** Publishers that block automated readers; skipping them saves a slow failed request. */
const PAYWALLED_DOMAINS = [
  'reuters.com', 'wsj.com', 'bloomberg.com', 'ft.com', 'barrons.com', 'nytimes.com', 'economist.com', 'nikkei.com', 'marketwatch.com',
];
const DIRECT_TIMEOUT_MS = 15_000;

export function isGoogleNewsUrl(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    return hostname === 'news.google.com' && /\/articles\/[^/]+$/.test(pathname);
  } catch {
    return false;
  }
}

export function isPaywalled(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return PAYWALLED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/** Publisher URL behind a Google News article link, or null if Google does not reveal it. */
export async function decodeGoogleNewsUrl(url: string, fetchImpl: FetchLike = fetch): Promise<string | null> {
  const id = new URL(url).pathname.split('/').pop() ?? '';
  const page = await getText(`https://news.google.com/articles/${id}`, { 'User-Agent': BROWSER_USER_AGENT }, GOOGLE_TIMEOUT_MS, fetchImpl);
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
  try {
    const response = await fetchImpl('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': BROWSER_USER_AGENT },
      body: `f.req=${encodeURIComponent(JSON.stringify([[['Fbv4je', request, null, 'generic']]]))}`,
      signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    });
    return response.ok ? parseBatchExecuteUrl(await response.text()) : null;
  } catch {
    return null;
  }
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

/** Article body via Jina Reader, or null when blocked, empty or too short to summarize. */
export async function readWithJina(url: string, fetchImpl: FetchLike = fetch): Promise<string | null> {
  if (isPaywalled(url)) return null;
  const markdown = await getText(
    `https://r.jina.ai/${url}`,
    { 'X-Retain-Images': 'none', 'X-Timeout': JINA_SERVER_TIMEOUT_S },
    JINA_TIMEOUT_MS,
    fetchImpl,
  );
  return markdown ? articleTextFromJina(markdown) : null;
}

/** Keeps the prose paragraphs of Jina's markdown: drops navigation, link lists, tables and headers. */
export function articleTextFromJina(markdown: string): string | null {
  // Error and 404 pages come back with HTTP 200 but no title.
  const title = markdown.match(/^Title:(.*)$/m)?.[1]?.trim();
  if (!title) return null;
  const body = markdown.split(/^Markdown Content:\s*$/m)[1] ?? '';
  const blocks = body.split(/\n\s*\n/).map((block) => block
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[#>*\-\s|]+/gm, '')
    .replace(/[*_`]+/g, ''));
  return joinProse(blocks);
}

/** Article body from the publisher page itself (Readability), or null when blocked or too short. */
export async function readDirect(url: string, fetchImpl: FetchLike = fetch): Promise<string | null> {
  if (isPaywalled(url)) return null;
  const html = await getText(url, { 'User-Agent': BROWSER_USER_AGENT, Accept: 'text/html,application/xhtml+xml' }, DIRECT_TIMEOUT_MS, fetchImpl);
  return html ? articleTextFromHtml(html) : null;
}

/** The part of linkedom's document we use; its declared types differ between Node and Deno. */
interface ParsedDocument {
  querySelectorAll(selectors: string): ArrayLike<{ readonly textContent: string | null }>;
}

function parseDocument(html: string): ParsedDocument {
  return (parseHTML(html) as unknown as { document: ParsedDocument }).document;
}

export function articleTextFromHtml(html: string): string | null {
  const article = new Readability(parseDocument(html) as never).parse();
  if (!article?.content) return null;
  const document = parseDocument(`<html><body>${article.content}</body></html>`);
  const blocks = Array.from(document.querySelectorAll('p, li, blockquote'), (node) => node.textContent ?? '');
  return joinProse(blocks);
}

/** Keeps real sentences: drops short lines, tables, page chrome (tickers, banners, legal notes). */
function joinProse(blocks: readonly string[]): string | null {
  const paragraphs = blocks
    .map((block) => block.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length >= MIN_PARAGRAPH_CHARS && !p.includes(' | ') && /[.!?]["”’)]?$/.test(p) && !BOILERPLATE.test(p));
  const text = [...new Set(paragraphs)].join('\n\n');
  return text.length >= MIN_ARTICLE_CHARS ? text.slice(0, MAX_ARTICLE_CHARS) : null;
}

async function getText(url: string, headers: Record<string, string>, timeoutMs: number, fetchImpl: FetchLike): Promise<string | null> {
  try {
    const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}
