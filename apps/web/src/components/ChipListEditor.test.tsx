import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ChipListEditor } from './ChipListEditor.tsx';

describe('ChipListEditor', () => {
  test('adds with Enter, skips duplicates and removes a chip', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ChipListEditor label="Từ khóa" values={['oil']} onChange={onChange} />);

    await user.type(screen.getByLabelText('Thêm vào Từ khóa'), 'opec, oil{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(['oil', 'opec']);

    await user.click(screen.getByRole('button', { name: 'Xóa "oil"' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  test('edits a chip in place', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ChipListEditor label="Từ khóa" values={['oil', 'brent']} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'brent' }));
    const input = screen.getByLabelText('Sửa "brent"');
    await user.clear(input);
    await user.type(input, 'wti{Enter}');

    expect(onChange).toHaveBeenLastCalledWith(['oil', 'wti']);
  });
});
