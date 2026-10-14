import type { RawItem } from '../types.ts';

const MAX_DESCRIPTION_LENGTH = 1_000;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

/** Decode the HTML entities that commonly survive in feed text. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X')) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Plain, single-line text: tags removed, entities decoded, whitespace collapsed. */
export function cleanText(text: string | undefined): string {
  if (!text) return '';
  return decodeEntities(text.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function cleanDescription(text: string | undefined): string | undefined {
  const cleaned = cleanText(text);
  if (!cleaned) return undefined;
  return cleaned.length > MAX_DESCRIPTION_LENGTH ? `${cleaned.slice(0, MAX_DESCRIPTION_LENGTH)}…` : cleaned;
}

export function parseDate(value: string | number | undefined): Date | undefined {
  if (value === undefined || value === '') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

/** Drop undefined optional fields (exactOptionalPropertyTypes). */
export function compactItem(item: { [K in keyof RawItem]: RawItem[K] | undefined }): RawItem {
  return Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined)) as unknown as RawItem;
}
