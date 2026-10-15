// Deterministic parts of scoring (DESIGN.md §4.2): code-only pre-ranking decides which items
// are worth an AI call; the final score mixes the AI impact with facts the AI does not judge.

const HOUR_MS = 3_600_000;
export const PRE_RANK_LIMIT = 150;
export const PRE_RANK_PER_CATEGORY = 30;
const SOURCE_COUNT_BONUS = 3;
const SOURCE_COUNT_BONUS_MAX = 15;
const STALE_AFTER_HOURS = 18;

export interface RankItem {
  readonly categoryId: string | null;
  readonly entityId: string | null;
  readonly authority: number;
  readonly sourceCount: number;
  readonly publishedAt: Date | null;
  readonly fetchedAt: Date;
}

function ageHours(item: Pick<RankItem, 'publishedAt' | 'fetchedAt'>, now: Date): number {
  return Math.max(0, (now.getTime() - (item.publishedAt ?? item.fetchedAt).getTime()) / HOUR_MS);
}

/** Heuristic priority before any AI call: official/major sources, wide coverage, tracked entities, freshness. */
export function preRankScore(item: RankItem, now: Date): number {
  return item.authority * 3 + (item.sourceCount - 1) * 5 + (item.entityId ? 5 : 0) - ageHours(item, now) / 3;
}

/** Best `limit` items, at most `perCategory` from one category so a busy category cannot crowd out the rest. */
export function preRank<T extends RankItem>(items: readonly T[], now: Date, limit = PRE_RANK_LIMIT, perCategory = PRE_RANK_PER_CATEGORY): T[] {
  const sorted = [...items].sort((a, b) => preRankScore(b, now) - preRankScore(a, now));
  const perCategoryCount = new Map<string, number>();
  const picked: T[] = [];
  for (const item of sorted) {
    if (picked.length >= limit) break;
    const key = item.categoryId ?? '';
    const count = perCategoryCount.get(key) ?? 0;
    if (count >= perCategory) continue;
    perCategoryCount.set(key, count + 1);
    picked.push(item);
  }
  return picked;
}

export function finalScore(input: RankItem & { readonly impact: number }, now: Date): number {
  const coverage = Math.min(SOURCE_COUNT_BONUS_MAX, (input.sourceCount - 1) * SOURCE_COUNT_BONUS);
  const stalePenalty = Math.max(0, ageHours(input, now) - STALE_AFTER_HOURS);
  return Math.round(input.impact * 10 + coverage + input.authority - stalePenalty);
}
