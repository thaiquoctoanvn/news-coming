import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import type { Job, SearchStatus } from '../../lib/jobs-api.ts';
import { afterLoginPath } from '../auth/LoginPage.tsx';
import { JobCard } from './JobCard.tsx';
import { creditStatus, formatDeadline, groupJobs, highScoreCount } from './job-view.ts';

const job: Job = {
  id: 'j1', sourceId: 'itviec', url: 'https://itviec.com/it-jobs/android-1', title: 'Senior Android Engineer <b>Kotlin</b>',
  company: 'Acme', location: 'Ho Chi Minh', salary: '20–45 triệu', postedText: 'Làm mới 07/11', deadline: '2026-11-29',
  verificationNote: null, score: 8, reason: 'Hợp Kotlin và Compose.', tip: 'Nhấn mạnh dự án thanh toán.', tier: 'top', isUpdate: true,
};

describe('JobCard', () => {
  test('shows the posting as text with score, terms, reason, CV tip and a safe link', () => {
    render(<JobCard job={job} sourceName="ITviec" />);

    expect(screen.getByRole('heading', { name: 'Senior Android Engineer <b>Kotlin</b>' })).toBeInTheDocument();
    expect(screen.getByText('8/10')).toBeInTheDocument();
    expect(screen.getByText('Cập nhật')).toBeInTheDocument();
    expect(screen.getByText('Acme · Ho Chi Minh')).toBeInTheDocument();
    expect(screen.getByText('20–45 triệu · Hạn 29/11 · Làm mới 07/11')).toBeInTheDocument();
    expect(screen.getByText('Hợp Kotlin và Compose.')).toBeInTheDocument();
    expect(screen.getByText(/Nhấn mạnh dự án thanh toán/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Xem tin/ });
    expect(link).toHaveAttribute('href', 'https://itviec.com/it-jobs/android-1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('an unverified posting says why and asks the reader to check it', () => {
    const unverified: Job = { ...job, tier: 'unverified', verificationNote: 'Không đọc được trang (HTTP 403)', company: null, tip: 'x' };
    render(<JobCard job={unverified} sourceName="TopCV" />);

    expect(screen.getByText('Chưa xác minh')).toBeInTheDocument();
    expect(screen.getByText(/Không đọc được trang \(HTTP 403\)\. Bấm “Xem tin” để tự kiểm tra/)).toBeInTheDocument();
    expect(screen.queryByText(/Nên nhấn mạnh/)).not.toBeInTheDocument();
  });

  test('does not render a link for unsafe URLs', () => {
    render(<JobCard job={{ ...job, url: 'javascript:alert(1)' }} sourceName="ITviec" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('job view helpers', () => {
  test('groups in a fixed order and keeps low scores', () => {
    const jobs: Job[] = [
      { ...job, id: 'a', tier: 'low', score: 3 },
      { ...job, id: 'b', tier: 'unverified', score: 9 },
      { ...job, id: 'c', tier: 'top', score: 9 },
      { ...job, id: 'd', tier: 'maybe', score: 5 },
    ];
    expect(groupJobs(jobs).map((group) => [group.tier, group.jobs.length])).toEqual([['top', 1], ['maybe', 1], ['unverified', 1], ['low', 1]]);
    expect(highScoreCount(jobs)).toBe(2);
    expect(formatDeadline('2026-11-29')).toBe('29/11');
  });

  test('credit warning: low balance, close to the 12-month expiry, or expired', () => {
    const status = (spent: number, creditDate = '2026-11-15'): SearchStatus => ({
      monthlyStopUsd: 0.8, monthCostUsd: 0, monthSearches: 0, creditUsd: 5, creditDate, spentSinceCreditUsd: spent,
    });
    const now = new Date('2026-12-01T00:00:00Z');

    expect(creditStatus(status(0.5), now)).toMatchObject({ balanceUsd: 4.5, warning: null });
    expect(creditStatus(status(4.2), now)?.warning).toContain('còn khoảng 0.80 USD');
    expect(creditStatus(status(0.5, '2025-12-20'), now)?.warning).toBe('Credit tìm kiếm hết hạn sau 19 ngày.');
    expect(creditStatus(status(0.5, '2025-11-01'), now)?.warning).toContain('quá hạn 12 tháng');
    expect(creditStatus({ ...status(0), creditUsd: null }, now)).toBeNull();
  });

  test('login only returns to in-app paths', () => {
    expect(afterLoginPath('/viec-lam')).toBe('/viec-lam');
    expect(afterLoginPath('//evil.example')).toBe('/quan-tri');
    expect(afterLoginPath('https://evil.example')).toBe('/quan-tri');
    expect(afterLoginPath(null)).toBe('/quan-tri');
  });
});
