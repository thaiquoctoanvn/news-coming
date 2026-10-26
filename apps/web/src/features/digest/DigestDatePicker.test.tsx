import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { DigestDatePicker } from './DigestDatePicker.tsx';

describe('DigestDatePicker', () => {
  test('opens a calendar where only days with a digest can be picked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DigestDatePicker
        date="2026-10-16"
        availableDates={['2026-10-16', '2026-10-14']}
        label="Thứ Sáu, 16/10/2026"
        onSelect={onSelect}
      />,
    );

    const trigger = screen.getByRole('button', { name: /16\/10\/2026/ });
    // The popover anchors to the picker's group; without one it never gets a position and stays hidden.
    expect(screen.getByRole('group')).toContainElement(trigger);

    await user.click(trigger);
    const grid = await screen.findByRole('grid');
    const day = (n: number) => within(grid).getAllByRole('button').find((b) => b.textContent?.trim() === String(n));

    expect(day(15)).toHaveAttribute('aria-disabled', 'true');
    await user.click(day(14)!);

    expect(onSelect).toHaveBeenCalledWith('2026-10-14');
  });
});
