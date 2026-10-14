import { z } from 'zod';
import type { RawItem } from '../types.ts';
import { cleanText, hostOf, parseDate } from './text.ts';

// JSON sources: Binance announcements (unofficial endpoint) and the GDELT DOC API.

const binanceSchema = z.object({
  data: z.object({
    catalogs: z.array(
      z.object({
        articles: z.array(z.object({ code: z.string(), title: z.string(), releaseDate: z.number() })),
      }),
    ),
  }),
});

export function parseBinanceAnnouncements(json: string): RawItem[] {
  const data = binanceSchema.parse(JSON.parse(json));
  return data.data.catalogs.flatMap((catalog) =>
    catalog.articles.map((article): RawItem => {
      const publishedAt = parseDate(article.releaseDate);
      return {
        url: `https://www.binance.com/en/support/announcement/detail/${article.code}`,
        title: cleanText(article.title),
        publisher: 'Binance',
        publisherDomain: 'binance.com',
        ...(publishedAt ? { publishedAt } : {}),
      };
    }),
  );
}

const gdeltSchema = z.object({
  articles: z.array(z.object({ url: z.string(), title: z.string(), seendate: z.string(), domain: z.string() })).default([]),
});

export function gdeltUrl(query: string): string {
  const q = encodeURIComponent(query);
  return `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&format=json&maxrecords=50&timespan=1d`;
}

export function parseGdelt(json: string): RawItem[] {
  // GDELT answers rate-limit errors as plain text with HTTP 200.
  if (!json.trimStart().startsWith('{')) throw new Error(`GDELT: ${json.slice(0, 120)}`);
  const data = gdeltSchema.parse(JSON.parse(json));
  return data.articles.map((article): RawItem => {
    // seendate format: 20261014T083000Z
    const iso = article.seendate.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z');
    const publishedAt = parseDate(iso);
    const domain = hostOf(article.url) ?? article.domain;
    return {
      url: article.url,
      title: cleanText(article.title),
      publisher: article.domain,
      publisherDomain: domain,
      ...(publishedAt ? { publishedAt } : {}),
    };
  });
}
