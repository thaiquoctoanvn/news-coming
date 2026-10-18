import { describe, expect, test } from 'vitest';
import { type AssistInput, buildCategoryAssistPrompt, cleanSuggestion } from '../../../supabase/functions/_shared/category-assist.ts';

const input: AssistInput = {
  topicName: 'Vĩ mô / Tài chính', topicDescription: 'Dầu, FED, vàng',
  categoryName: 'Vàng', categoryId: 'gold', brief: 'giá vàng, NHTW mua vàng, ETF vàng',
  keywords: ['gold', 'bullion'], excludeKeywords: [], description: null,
};

describe('category assist', () => {
  test('prompt carries the admin notes and current keywords', () => {
    const prompt = buildCategoryAssistPrompt(input);

    expect(prompt.user).toContain('Admin notes (may be Vietnamese): giá vàng, NHTW mua vàng, ETF vàng');
    expect(prompt.user).toContain('Current keywords: gold, bullion');
  });

  test('suggestions are trimmed, lowercased, deduplicated and skip existing keywords', () => {
    const result = cleanSuggestion({
      keywords: [' Gold ', 'Central Bank Gold', 'central bank gold', 'gold etf', 'a, b', 'x'.repeat(50)],
      exclude_keywords: ['Gold Medal'],
      description: '  News about   gold prices. ',
    }, input);

    expect(result).toEqual({
      keywords: ['central bank gold', 'gold etf'],
      excludeKeywords: ['gold medal'],
      description: 'News about gold prices.',
    });
  });
});
