import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { authorityForDomain } from '../src/sources/authority.ts';
import { parseEdgarSubmissions } from '../src/sources/edgar.ts';
import { cleanPublisher, googleNewsUrl, parseGoogleNews } from '../src/sources/google-news.ts';
import { parseBinanceAnnouncements, parseGdelt } from '../src/sources/json-sources.ts';
import { parseFeed } from '../src/sources/rss.ts';
import { parseTreasuryPressReleases } from '../src/sources/treasury.ts';

const fixture = (name: string): string => readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8');

describe('parseFeed', () => {
  test('parses RSS 2.0 with BOM, CDATA and numeric entities', () => {
    const items = parseFeed(fixture('fed.xml'));

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      url: 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20261013a.htm',
      title: "Minutes of the Board's discount rate meetings on August 17, 2026",
      description: "Minutes of the Board's discount rate meetings",
    });
    expect(items[0]?.publishedAt?.toISOString()).toBe('2026-10-13T18:00:00.000Z');
  });

  test('parses Atom entries using the alternate link', () => {
    const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry>
      <title>Atom title</title><link rel="alternate" href="https://example.com/a"/><updated>2026-10-14T01:00:00Z</updated>
    </entry></feed>`;

    expect(parseFeed(atom)).toEqual([
      { url: 'https://example.com/a', title: 'Atom title', publishedAt: new Date('2026-10-14T01:00:00Z') },
    ]);
  });

  test('throws on unknown documents', () => {
    expect(() => parseFeed('<html><body>blocked</body></html>')).toThrow('Unrecognized feed format');
  });
});

describe('parseGoogleNews', () => {
  test('strips the publisher suffix, drops the description and keeps the publisher domain', () => {
    const items = parseGoogleNews(fixture('gnews.xml'));

    expect(items[0]).toEqual({
      url: 'https://news.google.com/rss/articles/CBMiowFBVV95cUxOU3Z?oc=5',
      title: 'Coinbase Warns Bitcoin Faces Quantum Threat',
      publishedAt: new Date('2026-10-14T03:51:12Z'),
      publisher: 'Yahoo Finance',
      publisherDomain: 'finance.yahoo.com',
    });
    expect(items[1]?.publisherDomain).toBe('reuters.com');
  });

  test('shortens publisher names with a page title prefix', () => {
    expect(cleanPublisher('Crude Oil Prices Today | OilPrice.com')).toBe('OilPrice.com');
    expect(cleanPublisher('Reuters')).toBe('Reuters');
  });

  test('builds a 1-day search URL', () => {
    expect(googleNewsUrl('"Federal Reserve" OR FOMC')).toBe(
      'https://news.google.com/rss/search?q=%22Federal%20Reserve%22%20OR%20FOMC%20when%3A1d&hl=en-US&gl=US&ceid=US:en',
    );
  });
});

describe('parseEdgarSubmissions', () => {
  test('keeps only forms of interest and builds archive URLs', () => {
    const items = parseEdgarSubmissions(fixture('edgar.json'));

    expect(items.map((i) => i.title)).toEqual([
      'Strategy Inc — 8-K: Regulation FD disclosure; Other events',
      'Strategy Inc — 10-Q',
    ]);
    expect(items[0]?.url).toBe('https://www.sec.gov/Archives/edgar/data/1050446/000119312526419726/mstr-20261012.htm');
    expect(items[0]?.publisherDomain).toBe('sec.gov');
  });
});

describe('parseTreasuryPressReleases', () => {
  test('reads date, link and decoded title of each release', () => {
    const items = parseTreasuryPressReleases(fixture('treasury.html'));

    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({
      url: 'https://home.treasury.gov/news/press-releases/sb0656/',
      title: 'Treasury Targets Cartel del Noreste’s Horse Racing Enterprise',
      publishedAt: new Date('2026-10-13T14:30:00Z'),
    });
  });

  test('fails loudly when the layout changes', () => {
    expect(() => parseTreasuryPressReleases('<html></html>')).toThrow('layout may have changed');
  });
});

describe('JSON sources', () => {
  test('parses Binance announcements', () => {
    const [item] = parseBinanceAnnouncements(fixture('binance.json'));

    expect(item?.url).toBe('https://www.binance.com/en/support/announcement/detail/e52ef13311eb4e1a96f07099152e61d5');
    expect(item?.publishedAt?.getTime()).toBe(1791948608368);
  });

  test('turns GDELT plain-text rate limit answers into errors', () => {
    expect(() => parseGdelt('Please limit requests to one every 5 seconds')).toThrow('GDELT: Please limit');
  });

  test('parses GDELT seendate', () => {
    const json = JSON.stringify({ articles: [{ url: 'https://www.reuters.com/x', title: 'T', seendate: '20261014T083000Z', domain: 'reuters.com' }] });

    expect(parseGdelt(json)[0]?.publishedAt?.toISOString()).toBe('2026-10-14T08:30:00.000Z');
  });
});

describe('authorityForDomain', () => {
  test.each([
    ['federalreserve.gov', 10],
    ['home.treasury.gov', 10],
    ['reuters.com', 5],
    ['finance.yahoo.com', 0],
    [undefined, 0],
  ])('%s → %i', (domain, expected) => {
    expect(authorityForDomain(domain)).toBe(expected);
  });
});
