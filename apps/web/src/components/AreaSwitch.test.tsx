import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import { AreaSwitch } from './AreaSwitch.tsx';

const auth = vi.hoisted(() => ({ isAdmin: false }));
vi.mock('../lib/auth.tsx', () => ({ useAuth: () => ({ isLoading: false, isAdmin: auth.isAdmin, signOut: async () => {} }) }));

describe('AreaSwitch', () => {
  test('visitors do not see it', () => {
    auth.isAdmin = false;
    render(<MemoryRouter><AreaSwitch current="finance" /></MemoryRouter>);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  test('the admin switches areas in the same tab', () => {
    auth.isAdmin = true;
    render(<MemoryRouter><AreaSwitch current="finance" /></MemoryRouter>);

    const jobs = screen.getByRole('link', { name: 'Việc làm' });
    expect(jobs).toHaveAttribute('href', '/viec-lam');
    expect(jobs).not.toHaveAttribute('target');
    expect(screen.getByRole('link', { name: 'Tài chính' })).toHaveAttribute('aria-current', 'page');
  });
});
