import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { SupabaseContext } from '../../lib/supabase.ts';
import { CONFIG_TABLES } from './config-tables.ts';
import { EditableTable } from './EditableTable.tsx';

const sources = CONFIG_TABLES.find((t) => t.id === 'sources')!;

function fakeDb() {
  const tables: Record<string, unknown[]> = {
    sources: [{ id: 's1', topic_id: 't', name: 'CNBC', kind: 'rss', url: 'https://cnbc.com/rss', query: null, default_category_id: 'oil', authority: 3, enabled: true, last_error: null }],
    categories: [{ topic_id: 't', id: 'oil', name_vi: 'Dầu', position: 1 }, { topic_id: 't', id: 'fed', name_vi: 'FED', position: 2 }],
  };
  const update = vi.fn();
  const from = (table: string) => {
    const read = { eq: () => read, order: () => Promise.resolve({ data: tables[table] ?? [], error: null }) };
    return {
      select: () => read,
      update: (patch: unknown) => {
        update(table, patch);
        return { match: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) };
      },
    };
  };
  return { db: { from }, update };
}

function renderTable() {
  const { db, update } = fakeDb();
  render(
    <SupabaseContext.Provider value={db as never}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <EditableTable def={sources} topicId="t" />
      </QueryClientProvider>
    </SupabaseContext.Provider>,
  );
  return update;
}

describe('EditableTable', () => {
  test('shows rows read-only with the category name', async () => {
    renderTable();

    expect(await screen.findByText('CNBC')).toBeInTheDocument();
    expect(await screen.findByText('Dầu')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  test('edits in a popup and saves only on OK', async () => {
    const user = userEvent.setup();
    const update = renderTable();

    await user.click(await screen.findByRole('button', { name: 'Sửa CNBC' }));
    const dialog = await screen.findByRole('dialog');
    const name = within(dialog).getByRole('textbox', { name: 'Tên' });
    await user.clear(name);
    await user.type(name, 'CNBC Markets');
    await user.click(within(dialog).getByRole('button', { name: 'Hủy' }));
    expect(update).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Sửa CNBC' }));
    const again = await screen.findByRole('dialog');
    await user.clear(within(again).getByRole('textbox', { name: 'Tên' }));
    await user.type(within(again).getByRole('textbox', { name: 'Tên' }), 'CNBC Markets');
    await user.click(within(again).getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(update).toHaveBeenCalledWith('sources', expect.objectContaining({ name: 'CNBC Markets', default_category_id: 'oil', authority: 3 })));
  });
});
