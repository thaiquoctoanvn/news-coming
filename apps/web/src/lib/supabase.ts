import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createContext, useContext } from 'react';

export function createSupabase(url: string, anonKey: string): SupabaseClient {
  // The public site never signs in; admin login arrives in Phase 6.
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const SupabaseContext = createContext<SupabaseClient | null>(null);

export function useSupabase(): SupabaseClient {
  const client = useContext(SupabaseContext);
  if (!client) throw new Error('SupabaseContext is missing');
  return client;
}
