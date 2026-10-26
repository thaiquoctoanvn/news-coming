import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { SupabaseContext } from '../../lib/supabase.ts';
import { Maintenance, purgeSummary } from './Maintenance.tsx';

function fakeDb() {
  const rpc = vi.fn((name: string) =>
    Promise.resolve(name === 'database_size_mb' ? { data: 42.5, error: null } : { data: { digests: 2, articles: 0 }, error: null }),
  );
  const read = { eq: () => read, maybeSingle: () => Promise.resolve({ data: null, error: null }) };
  return { db: { from: () => ({ select: () => read }), rpc }, rpc };
}

describe('Maintenance', () => {
  test('summary lists only tables with removed rows', () => {
    expect(purgeSummary({ digests: 3, articles: 120, events: 0 })).toBe('3 bản tin · 120 tin');
    expect(purgeSummary({ digests: 0 })).toBe('không có gì cần xóa');
  });

  test('"Dọn ngay" purges only after confirming', async () => {
    const user = userEvent.setup();
    const { db, rpc } = fakeDb();
    render(
      <SupabaseContext.Provider value={db as never}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <Maintenance />
        </QueryClientProvider>
      </SupabaseContext.Provider>,
    );

    expect(await screen.findByText('42.5 MB')).toBeInTheDocument();
    expect(screen.getByText(/chưa chạy lần nào/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dọn ngay' }));
    expect(rpc).not.toHaveBeenCalledWith('purge_old_data_now');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Đã dọn: 2 bản tin.');
    expect(rpc).toHaveBeenCalledWith('purge_old_data_now');
  });
});
