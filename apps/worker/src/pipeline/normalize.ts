import { createHash } from 'node:crypto';

const TRACKING_PARAM = /^(utm_\w+|fbclid|gclid|dclid|mc_cid|mc_eid|ref|ref_src|cmpid|ocid|oc|ns_\w+|guccounter|smid|sr_share)$/i;

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have', 'in', 'is', 'it', 'its',
  'of', 'on', 'or', 'over', 'says', 'said', 'that', 'the', 'to', 'up', 'was', 'were', 'will', 'with', 'after',
  'amid', 'new', 'how', 'why', 'what', 'into', 'than', 'this', 'but', 'not', 'more', 'about',
]);

/** URL without tracking parameters and fragment; null when not an http(s) URL. */
export function canonicalUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  url.hash = '';
  const kept = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAM.test(key))
    .sort(([a], [b]) => a.localeCompare(b));
  url.search = new URLSearchParams(kept).toString();
  return url.toString();
}

/** Stable hash used for de-duplication: ignores scheme, "www." and trailing slash. */
export function urlHash(canonical: string): string {
  const url = new URL(canonical);
  const host = url.hostname.replace(/^www\./, '');
  const path = url.pathname.replace(/\/+$/, '');
  const key = `${host}${path}${url.search}`;
  return createHash('sha256').update(key).digest('hex');
}

/** Significant lowercase words of a title, for similarity checks. */
export function titleTokens(title: string): Set<string> {
  const words = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%$.]+/gu, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
  return new Set(words);
}

export function shortHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}
