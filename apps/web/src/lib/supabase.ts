import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createContext, useContext } from 'react';

export function createSupabase(url: string, anonKey: string): SupabaseClient {
  // Visitors never sign in. The admin session is kept by supabase-js in localStorage (a static
  // SPA has no server to set httpOnly cookies — see .agents/rules/README.md "Project overrides");
  // every write is still enforced in Postgres by RLS + is_admin().
  return createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
}

export const SupabaseContext = createContext<SupabaseClient | null>(null);

export function useSupabase(): SupabaseClient {
  const client = useContext(SupabaseContext);
  if (!client) throw new Error('SupabaseContext is missing');
  return client;
}
