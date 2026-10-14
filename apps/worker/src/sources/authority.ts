// Authority bonus of the original publisher, used when a source aggregates many publishers
// (DESIGN.md §4.2: official +10, Reuters/Bloomberg-class +5).

const OFFICIAL_DOMAINS = ['federalreserve.gov', 'treasury.gov', 'sec.gov', 'boj.or.jp', 'mof.go.jp', 'bls.gov', 'bea.gov', 'eia.gov'];
const MAJOR_WIRE_DOMAINS = ['reuters.com', 'bloomberg.com', 'wsj.com', 'ft.com', 'apnews.com', 'nikkei.com'];

export const OFFICIAL_AUTHORITY = 10;
export const MAJOR_WIRE_AUTHORITY = 5;

export function authorityForDomain(domain: string | undefined): number {
  if (!domain) return 0;
  const matches = (list: readonly string[]): boolean => list.some((d) => domain === d || domain.endsWith(`.${d}`));
  if (matches(OFFICIAL_DOMAINS)) return OFFICIAL_AUTHORITY;
  if (matches(MAJOR_WIRE_DOMAINS)) return MAJOR_WIRE_AUTHORITY;
  return 0;
}
