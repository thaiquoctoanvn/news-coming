import { type FetchLike, decodeGoogleNewsUrl, extractArticleText, isGoogleNewsUrl } from '../shared.ts';
import type { EditionStore } from '../store/edition-store.ts';
import type { ArticleRow } from '../types.ts';

// Finds readable text for each selected article: its own page, then other outlets of the same
// story (the representative is often a paywalled Reuters/WSJ link), then title + description.

const MAX_ALTERNATES = 3;

export interface ArticleContent {
  readonly text: string;
  readonly originalUrl: string | null;
}

export async function loadArticleContent(store: EditionStore, article: ArticleRow, fetchImpl: FetchLike): Promise<ArticleContent> {
  const originalUrl = await resolveUrl(article.url, fetchImpl);
  const own = originalUrl ? await extractArticleText(originalUrl, fetchImpl) : null;
  if (own) return { text: own, originalUrl };

  if (article.clusterKey) {
    const alternates = await store.loadClusterUrls(article.topicId, article.clusterKey, article.id);
    for (const url of alternates.slice(0, MAX_ALTERNATES)) {
      const resolved = await resolveUrl(url, fetchImpl);
      const text = resolved ? await extractArticleText(resolved, fetchImpl) : null;
      if (text) return { text, originalUrl };
    }
  }
  return { text: [article.title, article.description].filter(Boolean).join('. '), originalUrl };
}

async function resolveUrl(url: string, fetchImpl: FetchLike): Promise<string | null> {
  if (!isGoogleNewsUrl(url)) return url;
  try {
    return await decodeGoogleNewsUrl(url, fetchImpl);
  } catch {
    return null;
  }
}
