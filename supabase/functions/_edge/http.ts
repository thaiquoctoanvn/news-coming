// Helpers for Edge Functions (Deno only — not part of the code shared with the Node worker).
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

/** Admin sessions expire 15 days after the last OTP login (same rule as public.is_admin()). */
export const ADMIN_SESSION_DAYS = 15;
const DAY_MS = 86_400_000;

// Auth is a bearer token, not a cookie, so allowing any origin does not enable CSRF.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(500, `Server is missing ${name}`);
  return value;
}

export function serviceClient(): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Wraps a POST JSON handler with CORS, method check and error-to-response mapping. */
export function serve(handler: (req: Request) => Promise<Response>): void {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    try {
      return await handler(req);
    } catch (error: unknown) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      console.error(JSON.stringify({ level: 'error', message: error instanceof Error ? error.message : String(error) }));
      return json({ error: 'Lỗi máy chủ, vui lòng thử lại sau.' }, 500);
    }
  });
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

/** The signed-in admin, or 401/403. Signups are disabled, so any valid user is the admin. */
export async function requireAdmin(req: Request, db: SupabaseClient): Promise<User> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Cần đăng nhập.');
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Phiên đăng nhập không hợp lệ.');
  const lastSignIn = data.user.last_sign_in_at ? Date.parse(data.user.last_sign_in_at) : 0;
  if (Date.now() - lastSignIn > ADMIN_SESSION_DAYS * DAY_MS) throw new HttpError(403, 'Phiên đăng nhập đã quá 15 ngày, vui lòng đăng nhập lại.');
  return data.user;
}

export function clientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compares secrets without leaking their length or content through timing. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}

/** Uses one press of an admin button today; 429 when the daily cap is reached. */
export async function useQuota(db: SupabaseClient, topicId: string, action: 'more' | 'refresh', cap: number, label: string): Promise<void> {
  const { data, error } = await db.rpc('use_action_quota', { p_topic_id: topicId, p_action: action, p_cap: cap });
  if (error) throw new Error(`use_action_quota: ${error.message}`);
  if (data !== true) throw new HttpError(429, `Đã dùng hết ${cap} lượt "${label}" hôm nay.`);
}
