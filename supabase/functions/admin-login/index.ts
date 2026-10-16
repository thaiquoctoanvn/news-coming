// Admin login (DESIGN.md §10.2): username → one-time code by email → session.
// The admin email never leaves the server: both requesting and verifying the code happen here.
import { z } from 'zod';
import { HttpError, clientIp, json, readJson, requireEnv, safeEqual, serve, serviceClient, sha256Hex } from '../_edge/http.ts';

const LIMITS = { request: 5, verify: 10 } as const; // per IP per hour
const GENERIC_SENT = 'Nếu tên đăng nhập đúng, mã đăng nhập đã được gửi tới email quản trị.';

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('request'), username: z.string().trim().min(1).max(100) }),
  z.object({ action: z.literal('verify'), code: z.string().regex(/^\d{6}$/) }),
]);

serve(async (req) => {
  const parsed = bodySchema.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, 'Dữ liệu không hợp lệ.');
  const body = parsed.data;
  const db = serviceClient();
  const adminEmail = requireEnv('ADMIN_EMAIL');

  // Rate limit per hashed IP (the raw IP is never stored).
  const ipHash = await sha256Hex(`${requireEnv('LOGIN_HASH_SALT')}:${clientIp(req)}`);
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count, error: countError } = await db.from('login_attempts').select('*', { count: 'exact', head: true })
    .eq('ip_hash', ipHash).eq('kind', body.action).gte('attempted_at', since);
  if (countError) throw new Error(`login_attempts: ${countError.message}`);
  if ((count ?? 0) >= LIMITS[body.action]) throw new HttpError(429, 'Quá nhiều lần thử, vui lòng thử lại sau 1 giờ.');
  await db.from('login_attempts').insert({ ip_hash: ipHash, kind: body.action });

  if (body.action === 'request') {
    if (await safeEqual(body.username, requireEnv('ADMIN_USERNAME'))) {
      const { error } = await db.auth.signInWithOtp({ email: adminEmail, options: { shouldCreateUser: false } });
      if (error) console.error(JSON.stringify({ level: 'error', message: 'signInWithOtp failed', error: error.message }));
    }
    // Same answer either way, so the username cannot be guessed from the response.
    return json({ ok: true, message: GENERIC_SENT });
  }

  const { data, error } = await db.auth.verifyOtp({ email: adminEmail, token: body.code, type: 'email' });
  if (error || !data.session) throw new HttpError(401, 'Mã không đúng hoặc đã hết hạn.');
  return json({ ok: true, session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token } });
});
