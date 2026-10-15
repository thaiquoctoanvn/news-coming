import { JINA_MIN_INTERVAL_MS, type FetchLike, decodeGoogleNewsUrl, isGoogleNewsUrl, isPaywalled, readWithJina } from '../shared.ts';
import type { ArticleRow } from '../types.ts';

// Reads each article's own text (DESIGN.md §8.1). An article is never paired with another
// article's text: when it cannot be read, the caller replaces the whole article or drops it.

export interface ArticleContent {
  /** Article body, or null when it could not be read. */
  readonly text: string | null;
  readonly originalUrl: string | null;
}

export interface ReaderOptions {
  readonly fetchImpl: FetchLike;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

/** Reads articles through Jina Reader, spacing calls for its free rate limit and caching results per run. */
export class ArticleReader {
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly cache = new Map<string, ArticleContent>();
  private lastCall = 0;

  constructor(options: ReaderOptions) {
    this.fetchImpl = options.fetchImpl;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
  }

  async read(article: ArticleRow): Promise<ArticleContent> {
    const cached = this.cache.get(article.id);
    if (cached) return cached;
    if (article.contentSnippet) return this.remember(article.id, { text: article.contentSnippet, originalUrl: null });

    const originalUrl = isGoogleNewsUrl(article.url) ? await this.decode(article.url) : article.url;
    if (!originalUrl) return this.remember(article.id, { text: null, originalUrl: null });
    if (isPaywalled(originalUrl)) return this.remember(article.id, { text: null, originalUrl });
    await this.waitTurn();
    const text = await readWithJina(originalUrl, this.fetchImpl);
    return this.remember(article.id, { text, originalUrl });
  }

  private async decode(url: string): Promise<string | null> {
    try {
      return await decodeGoogleNewsUrl(url, this.fetchImpl);
    } catch {
      return null;
    }
  }

  private async waitTurn(): Promise<void> {
    const wait = this.lastCall + JINA_MIN_INTERVAL_MS - this.now();
    if (wait > 0) await this.sleep(wait);
    this.lastCall = this.now();
  }

  private remember(id: string, content: ArticleContent): ArticleContent {
    this.cache.set(id, content);
    return content;
  }
}
