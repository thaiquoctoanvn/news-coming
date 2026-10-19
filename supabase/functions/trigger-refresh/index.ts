// "Cập nhật tin mới" (DESIGN.md §6): asks GitHub Actions to run the edition again with --refresh,
// which collects new news and appends the best of it to today's digest. Admin only, limited per day.
import { z } from 'zod';
import { createSupabaseEditionStore } from '../_shared/pipeline/supabase-edition-store.ts';
import { HttpError, json, readJson, requireAdmin, requireEnv, serve, serviceClient, useQuota } from '../_edge/http.ts';

const bodySchema = z.object({ topicId: z.string().min(1), editionId: z.string().min(1) });

serve(async (req) => {
  const db = serviceClient();
  await requireAdmin(req, db);
  const parsed = bodySchema.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, 'Thiếu topicId hoặc editionId.');
  const { topicId, editionId } = parsed.data;

  const store = createSupabaseEditionStore(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
  const config = await store.loadEditionConfig(topicId, editionId);
  if (!config) throw new HttpError(409, 'Chủ đề hoặc bản tin đang tắt.');

  const { data: setting, error } = await db.from('app_settings').select('value').eq('key', 'github_dispatch').maybeSingle();
  if (error || !setting) throw new Error('app_settings.github_dispatch is missing');
  const target = setting.value as { repo: string; workflow: string; ref: string };
  // Read the token before using a press, so a missing secret does not cost the admin a daily press.
  const token = requireEnv('GITHUB_DISPATCH_TOKEN');

  await useQuota(db, topicId, 'refresh', config.topic.dailyCapRefresh, 'Cập nhật tin mới');
  const response = await fetch(`https://api.github.com/repos/${target.repo}/actions/workflows/${target.workflow}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'news-coming-admin',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ref: target.ref,
      inputs: { command: 'edition', topic: topicId, edition: editionId, trigger: 'manual', refresh: 'true' },
    }),
  });
  if (response.status !== 204) throw new HttpError(502, `GitHub từ chối yêu cầu (HTTP ${response.status}).`);
  return json({ ok: true, message: 'Đã gửi yêu cầu. Tin mới sẽ có sau khoảng 5–15 phút.' });
});
