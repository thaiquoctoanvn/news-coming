import { z } from 'zod';

// Hard spending guard for the paid web search (docs/JOBS_PLAN.md §4): the worker stops calling the
// engine before the month's bill can reach 1 USD, whatever Google's own alerts do.

export const searchBudgetSchema = z.object({
  model: z.string().min(1),
  max_output_tokens: z.number().int().positive(),
  /** Stop below the 1 USD ceiling; the gap covers differences between this ledger and Google's bill. */
  monthly_stop_usd: z.number().positive().max(1),
  /** Below the free monthly allowance, so searches themselves are never billed. */
  monthly_search_cap: z.number().int().positive(),
  free_searches_per_month: z.number().int().nonnegative(),
  usd_per_1k_searches: z.number().nonnegative(),
  usd_per_mtok_in: z.number().nonnegative(),
  usd_per_mtok_out: z.number().nonnegative(),
});

export type SearchBudget = z.infer<typeof searchBudgetSchema>;

export interface SearchSpend {
  readonly monthCostUsd: number;
  readonly monthSearches: number;
  readonly todayCostUsd: number;
}

export interface SearchUsage {
  readonly searches: number;
  readonly tokensIn: number;
  readonly tokensOut: number;
}

const DAY_MS = 86_400_000;
const ESTIMATED_INPUT_TOKENS = 200;

/** What one call costs: tokens always, searches only beyond the free monthly allowance. */
export function costOf(usage: SearchUsage, budget: SearchBudget, monthSearchesBefore: number): number {
  const tokens = (usage.tokensIn * budget.usd_per_mtok_in + usage.tokensOut * budget.usd_per_mtok_out) / 1_000_000;
  const billedBefore = Math.max(0, monthSearchesBefore - budget.free_searches_per_month);
  const billedAfter = Math.max(0, monthSearchesBefore + usage.searches - budget.free_searches_per_month);
  return tokens + ((billedAfter - billedBefore) * budget.usd_per_1k_searches) / 1_000;
}

function daysLeftInMonth(today: string): number {
  const date = new Date(`${today}T00:00:00Z`);
  const nextMonth = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  return Math.round((nextMonth - date.getTime()) / DAY_MS);
}

/** Null when one more call is allowed; otherwise why not (shown in the run stats). */
export function refusal(budget: SearchBudget, spend: SearchSpend, today: string): string | null {
  if (spend.monthCostUsd >= budget.monthly_stop_usd) return 'đã chạm ngân sách tìm kiếm của tháng';
  if (spend.monthSearches >= budget.monthly_search_cap) return 'đã chạm số lượt tìm của tháng';
  // Spread what is left evenly over the remaining days so one bad day cannot use up the month.
  const leftBeforeToday = budget.monthly_stop_usd - (spend.monthCostUsd - spend.todayCostUsd);
  const todayAllowance = leftBeforeToday / daysLeftInMonth(today);
  const worstCase = costOf({ searches: 0, tokensIn: ESTIMATED_INPUT_TOKENS, tokensOut: budget.max_output_tokens }, budget, 0);
  return spend.todayCostUsd + worstCase > todayAllowance ? 'đã chạm ngân sách tìm kiếm của hôm nay' : null;
}

export function addSpend(spend: SearchSpend, usage: SearchUsage, costUsd: number): SearchSpend {
  return {
    monthCostUsd: spend.monthCostUsd + costUsd,
    monthSearches: spend.monthSearches + usage.searches,
    todayCostUsd: spend.todayCostUsd + costUsd,
  };
}
