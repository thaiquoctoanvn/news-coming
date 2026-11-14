// Small text helpers for listing pages. Postings are rendered as text, never as HTML.

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/g, (match, name: string) => ENTITIES[name] ?? match);
}

/** Visible text of an HTML fragment: no scripts, styles or tags, single spaces. */
export function htmlToText(html: string): string {
  const withoutCode = html.replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, '');
  return decodeEntities(withoutCode.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function textOrNull(html: string | undefined): string | null {
  const text = html ? htmlToText(html) : '';
  return text || null;
}
