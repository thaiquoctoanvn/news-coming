import { XMLParser } from 'fast-xml-parser';
import type { RawItem } from '../types.ts';
import { cleanDescription, cleanText, compactItem, hostOf, parseDate } from './text.ts';

// Parses RSS 2.0, RSS 1.0 (RDF) and Atom into RawItems.

type XmlNode = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
});

export function parseFeed(xml: string): RawItem[] {
  const doc = parser.parse(xml.replace(/^﻿/, '')) as XmlNode;
  const rss = asNode(doc['rss']);
  const channel = asNode(rss?.['channel']);
  if (channel) return toArray(channel['item']).map(fromRssItem).filter(isItem);

  const rdf = asNode(doc['rdf:RDF']);
  if (rdf) return toArray(rdf['item']).map(fromRssItem).filter(isItem);

  const feed = asNode(doc['feed']);
  if (feed) return toArray(feed['entry']).map(fromAtomEntry).filter(isItem);

  throw new Error('Unrecognized feed format');
}

function fromRssItem(node: unknown): RawItem | null {
  const item = asNode(node);
  if (!item) return null;
  const url = text(item['link']) || text(item['guid']);
  const title = cleanText(text(item['title']));
  if (!url || !title) return null;
  const source = asNode(item['source']);
  return compactItem({
    url,
    title,
    description: cleanDescription(text(item['description'])),
    publishedAt: parseDate(text(item['pubDate']) || text(item['dc:date'])),
    publisher: cleanText(text(item['source'])) || undefined,
    publisherDomain: hostOf(typeof source?.['@_url'] === 'string' ? source['@_url'] : undefined),
  });
}

function fromAtomEntry(node: unknown): RawItem | null {
  const entry = asNode(node);
  if (!entry) return null;
  const links = toArray(entry['link']).map(asNode);
  const alternate = links.find((l) => l && (l['@_rel'] === undefined || l['@_rel'] === 'alternate'));
  const url = typeof alternate?.['@_href'] === 'string' ? alternate['@_href'] : '';
  const title = cleanText(text(entry['title']));
  if (!url || !title) return null;
  return compactItem({
    url,
    title,
    description: cleanDescription(text(entry['summary']) || text(entry['content'])),
    publishedAt: parseDate(text(entry['published']) || text(entry['updated'])),
  });
}

/** Text content of a node that may be a string or { '#text': ... } when it has attributes. */
function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  const node = asNode(value);
  const inner = node?.['#text'];
  return typeof inner === 'string' ? inner.trim() : '';
}

function asNode(value: unknown): XmlNode | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as XmlNode) : undefined;
}

function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function isItem(item: RawItem | null): item is RawItem {
  return item !== null;
}
