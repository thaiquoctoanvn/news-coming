import type { Session } from '@supabase/supabase-js';
import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { useSupabase } from './supabase.ts';

// Admin session state. A session older than 15 days since the last code login is signed out here,
// and is also refused by Postgres (is_admin) and the Edge Functions.

export const ADMIN_SESSION_DAYS = 15;
const DAY_MS = 86_400_000;

export function isSessionFresh(session: Session | null, now = Date.now()): boolean {
  const lastSignIn = session?.user.last_sign_in_at;
  return Boolean(lastSignIn) && now - Date.parse(lastSignIn ?? '') <= ADMIN_SESSION_DAYS * DAY_MS;
}

interface AuthState {
  readonly isLoading: boolean;
  readonly isAdmin: boolean;
  readonly signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({ isLoading: true, isAdmin: false, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const db = useSupabase();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void db.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session && !isSessionFresh(data.session)) void db.auth.signOut();
      setSession(isSessionFresh(data.session) ? data.session : null);
      setIsLoading(false);
    });
    const { data } = db.auth.onAuthStateChange((_event, next) => setSession(isSessionFresh(next) ? next : null));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [db]);

  const value: AuthState = {
    isLoading,
    isAdmin: session !== null,
    signOut: async () => {
      await db.auth.signOut();
      setSession(null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
