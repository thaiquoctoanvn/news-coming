import { BROWSER_USER_AGENT, sleep as defaultSleep } from '../http.ts';
import { JINA_MIN_INTERVAL_MS, articleTextFromHtml, articleTextFromJina } from '../shared.ts';
import { htmlToText } from './sources/html.ts';

// Reads job pages: the site itself first, then Jina Reader (r.jina.ai, anonymous, ~20 requests/minute).
// Calls to Jina are spaced like the news reader's so both stay under the free limit.

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type PageRead =
  | { readonly status: 'ok'; readonly text: string; readonly prose: string | null }
  | { readonly status: 'gone'; readonly note: string }
  | { readonly status: 'blocked'; readonly note: string };

export interface PageReader {
  /** GET (or POST) a listing; throws on a non-2xx answer. */
  fetchText(url: string, init?: RequestInit): Promise<string>;
  /** A page as markdown through Jina Reader; throws when Jina cannot read it. */
  jinaMarkdown(url: string): Promise<string>;
  readPosting(url: string): Promise<PageRead>;
}

export interface PageReaderOptions {
  readonly fetchImpl?: FetchLike;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

const TIMEOUT_MS = 25_000;
const JINA_TIMEOUT_MS = 40_000;
// A real posting page is never this short; block pages and empty shells are.
const MIN_PAGE_CHARS = 400;
const JINA_TARGET_ERROR = /Target URL returned error (\d{3})/;

export function createPageReader(options: PageReaderOptions = {}): PageReader {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  let lastJinaCall = 0;

  async function request(url: string, init: RequestInit = {}, timeoutMs = TIMEOUT_MS): Promise<Response> {
    return fetchImpl(url, {
      ...init,
      headers: { 'User-Agent': BROWSER_USER_AGENT, 'Accept-Language': 'vi,en;q=0.8', ...init.headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  async function fetchText(url: string, init?: RequestInit): Promise<string> {
    const response = await request(url, init);
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${new URL(url).host}`);
    return response.text();
  }

  async function jinaMarkdown(url: string): Promise<string> {
    const wait = lastJinaCall + JINA_MIN_INTERVAL_MS - now();
    if (wait > 0) await sleep(wait);
    lastJinaCall = now();
    // Images are kept: ITviec only names the company in its logo's alt text.
    const response = await request(`https://r.jina.ai/${url}`, {}, JINA_TIMEOUT_MS);
    if (!response.ok) throw new Error(`Jina HTTP ${response.status} for ${new URL(url).host}`);
    return response.text();
  }

  async function readDirect(url: string): Promise<PageRead> {
    const response = await request(url);
    if (response.status === 404 || response.status === 410) return { status: 'gone', note: `HTTP ${response.status}` };
    if (!response.ok) return { status: 'blocked', note: `HTTP ${response.status}` };
    if (movedAway(url, response.url)) return { status: 'gone', note: 'chuyển về trang khác' };
    const html = await response.text();
    const text = htmlToText(html);
    if (text.length < MIN_PAGE_CHARS) return { status: 'blocked', note: 'trang trống' };
    return { status: 'ok', text, prose: articleTextFromHtml(html) };
  }

  async function readThroughJina(url: string): Promise<PageRead> {
    const markdown = await jinaMarkdown(url);
    const targetError = JINA_TARGET_ERROR.exec(markdown)?.[1];
    if (targetError === '404' || targetError === '410') return { status: 'gone', note: `HTTP ${targetError}` };
    const text = (markdown.split(/^Markdown Content:\s*$/m)[1] ?? '').trim();
    if (targetError || text.length < MIN_PAGE_CHARS) return { status: 'blocked', note: targetError ? `HTTP ${targetError}` : 'trang trống' };
    return { status: 'ok', text, prose: articleTextFromJina(markdown) };
  }

  async function readPosting(url: string): Promise<PageRead> {
    let direct: PageRead;
    try {
      direct = await readDirect(url);
    } catch (error: unknown) {
      direct = { status: 'blocked', note: error instanceof Error ? error.message.slice(0, 80) : 'lỗi mạng' };
    }
    if (direct.status !== 'blocked') return direct;
    try {
      const viaJina = await readThroughJina(url);
      return viaJina.status === 'blocked' ? direct : viaJina;
    } catch {
      return direct;
    }
  }

  return { fetchText, jinaMarkdown, readPosting };
}

/** A closed posting often redirects to the listing or home page: the posting's own slug is gone from the URL. */
function movedAway(requested: string, final: string): boolean {
  if (!final || final === requested) return false;
  const slug = new URL(requested).pathname.split('/').filter(Boolean).at(-1) ?? '';
  return slug.length > 0 && !new URL(final).pathname.includes(slug);
}
