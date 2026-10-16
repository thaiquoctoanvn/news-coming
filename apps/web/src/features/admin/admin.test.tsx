import type { Session } from '@supabase/supabase-js';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import { Toggle } from '../../components/Toggle.tsx';
import { AuthProvider, isSessionFresh } from '../../lib/auth.tsx';
import { SupabaseContext } from '../../lib/supabase.ts';
import { LoginPage } from '../auth/LoginPage.tsx';
import { fromInputText, patchFor, readValue, toInputText } from './config-tables.ts';

describe('config table values', () => {
  test('lists, numbers and times convert both ways', () => {
    expect(toInputText(['oil', 'opec'], 'list')).toBe('oil, opec');
    expect(fromInputText(' oil, opec ,, ', 'list')).toEqual(['oil', 'opec']);
    expect(fromInputText('1, 2, 5', 'numberList')).toEqual([1, 2, 5]);
    expect(toInputText('06:00:00', 'time')).toBe('06:00');
    expect(fromInputText('', 'number')).toBeNull();
    expect(() => fromInputText('abc', 'number')).toThrow('Cần nhập số');
    expect(() => fromInputText('6h', 'time')).toThrow('HH:MM');
  });

  test('jsonb fields are read and patched without losing other keys', () => {
    const row = { id: 'macro_finance', settings: { summary_words: 350, pin: { max: 3 } } };

    expect(readValue(row, 'settings.summary_words')).toBe(350);
    expect(patchFor(row, 'settings.summary_words', 300)).toEqual({ settings: { summary_words: 300, pin: { max: 3 } } });
    expect(patchFor(row, 'enabled', false)).toEqual({ enabled: false });
  });
});

describe('admin session', () => {
  const session = (daysAgo: number) => ({ user: { last_sign_in_at: new Date(Date.now() - daysAgo * 86_400_000).toISOString() } }) as Session;

  test('is valid for 15 days after the last code login', () => {
    expect(isSessionFresh(session(14))).toBe(true);
    expect(isSessionFresh(session(16))).toBe(false);
    expect(isSessionFresh(null)).toBe(false);
  });
});

describe('Toggle', () => {
  test('is an accessible switch that reports changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Toggle label="Bật nguồn" isSelected={false} onChange={onChange} />);

    await user.click(screen.getByRole('switch', { name: 'Bật nguồn' }));

    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('LoginPage', () => {
  test('asks for the username, then for the 6-digit code', async () => {
    const user = userEvent.setup();
    const invoke = vi.fn().mockResolvedValue({ data: { ok: true, message: 'Nếu tên đăng nhập đúng, mã đã được gửi.' }, error: null });
    const db = {
      functions: { invoke },
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
    };
    render(
      <SupabaseContext.Provider value={db as never}>
        <AuthProvider>
          <MemoryRouter><LoginPage /></MemoryRouter>
        </AuthProvider>
      </SupabaseContext.Provider>,
    );

    await user.type(screen.getByLabelText('Tên đăng nhập'), 'chu-bao');
    await user.click(screen.getByRole('button', { name: 'Gửi mã đăng nhập' }));

    expect(invoke).toHaveBeenCalledWith('admin-login', { body: { action: 'request', username: 'chu-bao' } });
    expect(await screen.findByText(/mã đã được gửi/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeDisabled();
  });
});
