import { describe, expect, test } from 'vitest';
import { loadEnv } from '../src/env.ts';

const base = { SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(40) };

describe('loadEnv', () => {
  test.each([
    'https://abc.supabase.co',
    'https://abc.supabase.co/',
    'https://abc.supabase.co/rest/v1/',
  ])('normalizes SUPABASE_URL %s to the project origin', (url) => {
    expect(loadEnv({ ...base, SUPABASE_URL: url }).SUPABASE_URL).toBe('https://abc.supabase.co');
  });

  test('rejects a SEC_USER_AGENT without contact email', () => {
    expect(() => loadEnv({ ...base, SUPABASE_URL: 'https://abc.supabase.co', SEC_USER_AGENT: 'news-coming' }))
      .toThrow('SEC_USER_AGENT');
  });

  test('treats an empty SEC_USER_AGENT as unset', () => {
    expect(loadEnv({ ...base, SUPABASE_URL: 'https://abc.supabase.co', SEC_USER_AGENT: '' }).SEC_USER_AGENT).toBeUndefined();
  });

  test('fails with the names of missing variables', () => {
    expect(() => loadEnv({})).toThrow(/SUPABASE_URL.*SUPABASE_SERVICE_ROLE_KEY/);
  });
});
