import type { PageReader } from './page-reader.ts';
import type { PendingJob, VerificationResult } from './types.ts';

// Decides whether a posting is still open by reading its own page (docs/JOBS_PLAN.md §6).
// Dates and status from search results are never trusted: search engines serve stale copies.

const MAX_DETAIL_CHARS = 4_000;
// Phrases a site shows on a posting that no longer takes applications. Kept specific on purpose:
// words like "expired" alone also appear in scripts and footers of open postings.
const CLOSED = /đã hết hạn nộp|tin (?:tuyển dụng )?(?:này )?đã hết hạn|việc làm (?:này )?đã hết hạn|ngừng nhận hồ sơ|tin đã đóng|no longer accepting applications|this job (?:has expired|is closed|is no longer available)|job (?:has )?expired/i;

export async function checkPosting(job: PendingJob, reader: PageReader, today: string): Promise<VerificationResult> {
  if (job.deadline && job.deadline < today) return { verification: 'closed', note: 'Quá hạn nộp hồ sơ', detailText: null };
  const page = await reader.readPosting(job.url);
  if (page.status === 'gone') return { verification: 'closed', note: `Tin không còn (${page.note})`, detailText: null };
  if (page.status === 'blocked') {
    return { verification: 'unverified', note: `Không đọc được trang (${page.note})`, detailText: null };
  }
  const marker = CLOSED.exec(page.text)?.[0];
  if (marker) return { verification: 'closed', note: `Trang ghi: "${marker}"`, detailText: null };
  return { verification: 'verified', note: null, detailText: (page.prose ?? page.text).slice(0, MAX_DETAIL_CHARS) };
}
