import type { SupabaseClient } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import type { Job, SearchStatus } from '../../lib/jobs-api.ts';
import { afterLoginPath } from '../auth/LoginPage.tsx';
import { SupabaseContext } from '../../lib/supabase.ts';
import { JobCard } from './JobCard.tsx';
import { ProfilesSection } from './ProfilesSection.tsx';
import { ScanJobsButton } from './ScanJobsButton.tsx';
import { creditStatus, formatDeadline, groupJobs, highScoreCount } from './job-view.ts';

const job: Job = {
  id: 'j1', sourceId: 'itviec', url: 'https://itviec.com/it-jobs/android-1', title: 'Senior Android Engineer <b>Kotlin</b>',
  company: 'Acme', location: 'Ho Chi Minh', salary: '20–45 triệu', postedText: 'Làm mới 07/11', deadline: '2026-11-29',
  verificationNote: null, score: 8, reason: 'Hợp Kotlin và Compose.', tip: 'Nhấn mạnh dự án thanh toán.', tier: 'top', isUpdate: true,
};

describe('JobCard', () => {
  test('the compact card shows the essentials as text and has no link of its own', () => {
    render(<JobCard job={job} sourceName="ITviec" />);

    expect(screen.getByRole('heading', { name: 'Senior Android Engineer <b>Kotlin</b>' })).toBeInTheDocument();
    expect(screen.getByText('8/10')).toBeInTheDocument();
    expect(screen.getByText('Cập nhật')).toBeInTheDocument();
    expect(screen.getByText('Acme · Ho Chi Minh')).toBeInTheDocument();
    expect(screen.getByText('20–45 triệu · Hạn 29/11 · Làm mới 07/11')).toBeInTheDocument();
    expect(screen.getByText('Hợp Kotlin và Compose.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('pressing the card opens a popup with the details, the CV tip and a safe link', async () => {
    const user = userEvent.setup();
    render(<JobCard job={job} sourceName="ITviec" />);

    await user.click(screen.getByRole('button', { name: /Xem chi tiết: Senior Android Engineer/ }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('20–45 triệu')).toBeInTheDocument();
    expect(within(dialog).getByText('29/11')).toBeInTheDocument();
    expect(within(dialog).getByText(/Nhấn mạnh dự án thanh toán/)).toBeInTheDocument();
    const link = within(dialog).getByRole('link', { name: /Xem tin/ });
    expect(link).toHaveAttribute('href', 'https://itviec.com/it-jobs/android-1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('an unverified posting says why in the popup and never links to an unsafe URL', async () => {
    const user = userEvent.setup();
    const unverified: Job = { ...job, tier: 'unverified', verificationNote: 'Không đọc được trang (HTTP 403)', company: null, url: 'javascript:alert(1)' };
    render(<JobCard job={unverified} sourceName="TopCV" />);

    expect(screen.getByText('Chưa xác minh')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Xem chi tiết/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Không đọc được trang \(HTTP 403\)\. Bấm “Xem tin” để tự kiểm tra/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('link')).not.toBeInTheDocument();
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

describe('ScanJobsButton', () => {
  /** A Supabase stub: every table query resolves to `rows`; the Edge Function call is recorded. */
  function setup(rows: Record<string, unknown[]>) {
    const invoke = vi.fn(async () => ({ data: { message: 'Đã gửi yêu cầu quét.' }, error: null }));
    const query = (table: string) => {
      const result = { data: rows[table] ?? [], error: null };
      const chain: Record<string, unknown> = {
        select: () => chain, eq: () => chain, gte: () => chain,
        maybeSingle: async () => ({ data: (rows[table] ?? [])[0] ?? null, error: null }),
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      };
      return chain;
    };
    const db = { from: query, functions: { invoke } } as unknown as SupabaseClient;
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SupabaseContext.Provider value={db}><ScanJobsButton /></SupabaseContext.Provider>
      </QueryClientProvider>,
    );
    return { invoke };
  }

  test('nothing is sent until the warning is confirmed with OK', async () => {
    const user = userEvent.setup();
    const { invoke } = setup({ action_quota: [{ count: 1 }] });

    await user.click(await screen.findByRole('button', { name: 'Quét ngay' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('5–15 phút');
    expect(dialog).toHaveTextContent('dùng chung hạn mức AI miễn phí');
    expect(await screen.findByText(/Hôm nay còn/)).toHaveTextContent('Hôm nay còn 2 / 3 lượt quét tay');
    expect(invoke).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(invoke).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Quét ngay' }));
    await user.click(await screen.findByRole('button', { name: 'OK' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Đã gửi yêu cầu quét.');
    expect(invoke).toHaveBeenCalledWith('trigger-jobs', { body: {} });
  });

  test('the button is disabled once today\'s presses are used up', async () => {
    setup({ action_quota: [{ count: 3 }] });
    expect(await screen.findByText('Đã dùng hết 3 lượt quét hôm nay.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quét ngay' })).toBeDisabled();
  });
});

describe('ProfilesSection', () => {
  test('a profile cannot be saved without a title', async () => {
    const user = userEvent.setup();
    const insert = vi.fn(() => ({ select: async () => ({ data: [{ id: 'p1' }], error: null }) }));
    const db = {
      from: () => ({ select: () => ({ order: async () => ({ data: [], error: null }) }), insert }),
    } as unknown as SupabaseClient;
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SupabaseContext.Provider value={db}><ProfilesSection /></SupabaseContext.Provider>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Thêm hồ sơ' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Kỹ năng/), 'Kotlin, 5 năm');
    await user.type(within(dialog).getByLabelText(/Tiêu đề/), '   ');
    await user.click(within(dialog).getByRole('button', { name: 'OK' }));
    expect(insert).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText(/Tiêu đề/), 'Android Senior');
    await user.click(within(dialog).getByRole('button', { name: 'OK' }));
    expect(insert).toHaveBeenCalledWith({ title: 'Android Senior', profile_text: 'Kotlin, 5 năm' });
  });
});
