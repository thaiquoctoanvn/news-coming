import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { SupabaseContext } from '../../../lib/supabase.ts';
import { CategoriesSection } from './CategoriesSection.tsx';

const category = (id: string, name_vi: string, position: number) => ({
  topic_id: 't', id, name_vi, keywords: [id], exclude_keywords: [], description_en: null, position, enabled: true,
});

function renderSection() {
  const tables: Record<string, unknown[]> = {
    categories: [category('oil', 'Dầu', 1), category('vang', 'Vàng', 2)],
    digest_slots: [{ topic_id: 't', id: 's1', position: 1, label_vi: 'Dầu mỏ', kind: 'category', category_ids: ['oil'], max_items: 2, min_score: 0, extra_item_min_score: null, enabled: true }],
  };
  const insert = vi.fn();
  const remove = vi.fn();
  const done = { select: () => Promise.resolve({ data: [], error: null }) };
  const from = (table: string) => {
    const read = { eq: () => read, order: () => Promise.resolve({ data: tables[table] ?? [], error: null }) };
    return {
      select: () => read,
      insert: (row: unknown) => {
        insert(table, row);
        return done;
      },
      delete: () => ({
        match: (m: unknown) => {
          remove(table, m);
          return done;
        },
      }),
    };
  };
  render(
    <SupabaseContext.Provider value={{ from } as never}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CategoriesSection topicId="t" />
      </QueryClientProvider>
    </SupabaseContext.Provider>,
  );
  return { insert, remove };
}

describe('CategoriesSection', () => {
  test('adds a category with an id made from its name', async () => {
    const user = userEvent.setup();
    const { insert } = renderSection();

    await user.click(await screen.findByRole('button', { name: 'Thêm danh mục' }));
    await user.type(screen.getByRole('textbox', { name: /Tên danh mục/ }), 'Vàng');
    await user.type(screen.getByLabelText('Thêm vào Từ khóa nhận diện'), 'silver{Enter}');
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Đã có danh mục cùng tên');

    await user.clear(screen.getByRole('textbox', { name: /Tên danh mục/ }));
    await user.type(screen.getByRole('textbox', { name: /Tên danh mục/ }), 'Bạc');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(insert).toHaveBeenCalledWith('categories', expect.objectContaining({ topic_id: 't', id: 'bac', name_vi: 'Bạc', keywords: ['silver'], position: 3, enabled: true }));
  });

  test('a category used by a priority slot cannot be deleted', async () => {
    const user = userEvent.setup();
    const { remove } = renderSection();

    await user.click(await screen.findByRole('button', { name: 'Xóa Dầu' }));
    expect(await screen.findByText('Dầu mỏ')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(remove).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Xóa Vàng' }));
    await user.click(await screen.findByRole('button', { name: 'OK' }));
    expect(remove).toHaveBeenCalledWith('categories', { topic_id: 't', id: 'vang' });
  });
});
