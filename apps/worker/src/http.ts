import { errorMessage } from './log.ts';

export const DEFAULT_USER_AGENT = 'news-coming/1.0 (+https://github.com/thaiquoctoanvn/news-coming)';
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 2_000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export class HttpError extends Error {
  readonly status: number;

  constructor(url: string, status: number) {
    super(`HTTP ${status} for ${new URL(url).host}`);
    this.status = status;
  }
}

export interface FetchOptions {
  readonly headers?: Readonly<Record<string, string>>;
}

/** GET a URL as text, with timeout and one retry on transient failures. */
export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  try {
    return await fetchOnce(url, options);
  } catch (error: unknown) {
    const retryable = !(error instanceof HttpError) || RETRYABLE_STATUS.has(error.status);
    if (!retryable) throw error;
    await sleep(RETRY_DELAY_MS);
    try {
      return await fetchOnce(url, options);
    } catch (retryError: unknown) {
      throw new Error(`${errorMessage(retryError)} (after retry)`);
    }
  }
}

async function fetchOnce(url: string, options: FetchOptions): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': DEFAULT_USER_AGENT, ...options.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new HttpError(url, response.status);
  return response.text();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Run `fn` over `items` with at most `limit` calls in flight, preserving order. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}
