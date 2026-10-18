import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { SupabaseContext } from '../../../lib/supabase.ts';
import { CategoryAssist } from './CategoryAssist.tsx';

describe('CategoryAssist', () => {
  test('sends the notes and lets the admin pick suggestions', async () => {
    const user = userEvent.setup();
    const invoke = vi.fn().mockResolvedValue({
      data: { keywords: ['gold', 'gold etf', 'central bank gold'], excludeKeywords: ['gold medal'], description: 'Gold prices and central bank buying.' },
      error: null,
    });
    const onAddKeywords = vi.fn();
    const onAddExcludes = vi.fn();
    const onUseDescription = vi.fn();
    render(
      <SupabaseContext.Provider value={{ functions: { invoke } } as never}>
        <QueryClientProvider client={new QueryClient()}>
          <CategoryAssist
            topicId="macro_finance" categoryId="gold" keywords={['gold']} excludeKeywords={[]}
            onAddKeywords={onAddKeywords} onAddExcludes={onAddExcludes} onUseDescription={onUseDescription}
          />
        </QueryClientProvider>
      </SupabaseContext.Provider>,
    );

    await user.type(screen.getByRole('textbox'), 'giá vàng, NHTW mua vàng');
    await user.click(screen.getByRole('button', { name: 'Gợi ý' }));

    expect(invoke).toHaveBeenCalledWith('category-assist', { body: { topicId: 'macro_finance', categoryId: 'gold', brief: 'giá vàng, NHTW mua vàng' } });
    expect(await screen.findByRole('button', { name: /"gold etf"/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /"gold"$/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /"gold etf"/ }));
    expect(onAddKeywords).toHaveBeenCalledWith(['gold etf']);
    await user.click(screen.getByRole('button', { name: 'Thêm tất cả' }));
    expect(onAddKeywords).toHaveBeenLastCalledWith(['gold etf', 'central bank gold']);
    await user.click(screen.getByRole('button', { name: /"gold medal"/ }));
    expect(onAddExcludes).toHaveBeenCalledWith(['gold medal']);
    await user.click(screen.getByRole('button', { name: 'Dùng mô tả này' }));
    expect(onUseDescription).toHaveBeenCalledWith('Gold prices and central bank buying.');
  });
});
