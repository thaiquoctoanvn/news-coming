import type { SupabaseClient } from '@supabase/supabase-js';

// Calls to the Edge Functions. Errors carry the Vietnamese message returned by the function.

interface FunctionErrorLike {
  readonly message: string;
  readonly context?: { json?: () => Promise<unknown> };
}

async function invoke<T>(db: SupabaseClient, name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.functions.invoke(name, { body });
  if (!error) return data as T;
  const detail = await (error as FunctionErrorLike).context?.json?.().catch(() => null);
  const message = (detail as { error?: string } | null)?.error;
  throw new Error(message ?? (error as FunctionErrorLike).message);
}

export async function requestLoginCode(db: SupabaseClient, username: string): Promise<string> {
  const result = await invoke<{ message: string }>(db, 'admin-login', { action: 'request', username });
  return result.message;
}

/** Verifies the emailed code on the server and stores the returned session in the client. */
export async function verifyLoginCode(db: SupabaseClient, code: string): Promise<void> {
  const result = await invoke<{ session: { access_token: string; refresh_token: string } }>(db, 'admin-login', { action: 'verify', code });
  const { error } = await db.auth.setSession(result.session);
  if (error) throw new Error(error.message);
}

export interface MoreResult {
  readonly added: number;
  readonly unreadable: number;
  readonly summarized: number;
  readonly translated: number;
  readonly rejected: number;
  readonly aiStopped: string | null;
}

export function requestMoreNews(db: SupabaseClient, digestId: string): Promise<MoreResult> {
  return invoke<MoreResult>(db, 'more-news', { digestId });
}

export async function requestRefresh(db: SupabaseClient, topicId: string, editionId: string): Promise<string> {
  const result = await invoke<{ message: string }>(db, 'trigger-refresh', { topicId, editionId });
  return result.message;
}

export interface CategorySuggestion {
  readonly keywords: string[];
  readonly excludeKeywords: string[];
  readonly description: string;
}

/** AI suggestions for one category from the admin's notes; nothing is saved by the call. */
export function requestCategoryAssist(db: SupabaseClient, topicId: string, categoryId: string, brief: string): Promise<CategorySuggestion> {
  return invoke<CategorySuggestion>(db, 'category-assist', { topicId, categoryId, brief });
}
