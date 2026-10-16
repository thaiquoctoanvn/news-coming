import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import type { DigestArticle } from '../../lib/types.ts';
import { DigestItemCard } from './DigestItemCard.tsx';

const article: DigestArticle = {
  id: 'a1', position: 1, slotId: 'oil', isPinned: true, sourceName: 'CNBC', url: 'https://www.cnbc.com/oil',
  publishedAt: '2026-10-16T01:00:00Z', categoryId: 'oil', impact: 9, direction: 'negative',
  title: 'Giá dầu tăng khi căng thẳng ở eo biển Hormuz leo thang',
  summary: 'Đoạn một về giá dầu.\n\nĐoạn hai <script>alert(1)</script> chỉ là chữ.',
};

describe('DigestItemCard', () => {
  test('shows labels, first paragraph and a safe link to the original article', () => {
    render(<DigestItemCard article={article} categoryName="Dầu" />);

    expect(screen.getByRole('heading', { name: /Giá dầu tăng/ })).toBeInTheDocument();
    expect(screen.getByText('Dầu')).toBeInTheDocument();
    expect(screen.getByText('Tác động rất mạnh')).toBeInTheDocument();
    expect(screen.getByText('Tiêu cực')).toBeInTheDocument();
    expect(screen.getByText('Đoạn một về giá dầu.')).toBeInTheDocument();
    expect(screen.queryByText(/Đoạn hai/)).not.toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Đọc bài gốc/ });
    expect(link).toHaveAttribute('href', 'https://www.cnbc.com/oil');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('expands the remaining paragraphs as plain text', async () => {
    const user = userEvent.setup();
    render(<DigestItemCard article={article} categoryName="Dầu" />);

    await user.click(screen.getByRole('button', { name: /Đọc tiếp/ }));

    expect(screen.getByText('Đoạn hai <script>alert(1)</script> chỉ là chữ.')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByRole('button', { name: 'Thu gọn' })).toHaveAttribute('aria-expanded', 'true');
  });

  test('does not render a link for unsafe URLs', () => {
    render(<DigestItemCard article={{ ...article, url: 'javascript:alert(1)' }} categoryName={undefined} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
