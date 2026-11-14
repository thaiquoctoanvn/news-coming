import type { Job, JobTier, SearchStatus } from '../../lib/jobs-api.ts';

// Pure view helpers of the job page.

export const TIER_ORDER: readonly JobTier[] = ['top', 'fit', 'maybe', 'unverified', 'low'];

export const TIER_LABEL: Readonly<Record<JobTier, string>> = {
  top: 'Nổi bật',
  fit: 'Phù hợp',
  maybe: 'Cân nhắc',
  unverified: 'Chưa xác minh',
  low: 'Điểm thấp',
};

export interface JobGroup {
  readonly tier: JobTier;
  readonly jobs: readonly Job[];
}

/** Jobs grouped for display, in a fixed order; empty groups are left out. */
export function groupJobs(jobs: readonly Job[]): JobGroup[] {
  return TIER_ORDER
    .map((tier) => ({ tier, jobs: jobs.filter((job) => job.tier === tier) }))
    .filter((group) => group.jobs.length > 0);
}

export function highScoreCount(jobs: readonly Job[]): number {
  return jobs.filter((job) => (job.score ?? 0) >= 7).length;
}

/** "29/11" from a YYYY-MM-DD deadline. */
export function formatDeadline(deadline: string): string {
  const [, month, day] = deadline.split('-');
  return `${day}/${month}`;
}

const DAY_MS = 86_400_000;
const LOW_BALANCE_USD = 1;
const EXPIRY_WARNING_DAYS = 30;
const CREDIT_VALID_DAYS = 365;

export interface CreditStatus {
  readonly balanceUsd: number;
  readonly daysToExpiry: number;
  /** Text to show when the admin should buy credit soon; null otherwise. */
  readonly warning: string | null;
}

/** Remaining prepaid search credit, estimated from our own spend ledger. */
export function creditStatus(status: SearchStatus, now: Date = new Date()): CreditStatus | null {
  if (status.creditUsd === null || !status.creditDate) return null;
  const balanceUsd = Math.max(0, status.creditUsd - status.spentSinceCreditUsd);
  const expiresAt = Date.parse(`${status.creditDate}T00:00:00Z`) + CREDIT_VALID_DAYS * DAY_MS;
  const daysToExpiry = Math.ceil((expiresAt - now.getTime()) / DAY_MS);
  let warning: string | null = null;
  if (daysToExpiry <= 0) warning = 'Credit tìm kiếm đã quá hạn 12 tháng. Tìm kiếm đang chạy bằng đường dự phòng miễn phí.';
  else if (balanceUsd < LOW_BALANCE_USD) warning = `Credit tìm kiếm còn khoảng ${balanceUsd.toFixed(2)} USD. Khi hết, tìm kiếm chuyển sang đường dự phòng miễn phí.`;
  else if (daysToExpiry <= EXPIRY_WARNING_DAYS) warning = `Credit tìm kiếm hết hạn sau ${daysToExpiry} ngày.`;
  return { balanceUsd, daysToExpiry, warning };
}
