// "Quét ngay" on the job board (docs/JOBS_PLAN.md): asks GitHub Actions to run the job scan now.
// Admin only, limited per day: a scan shares the free AI quota with the digest and spends paid search budget.
import { HttpError, json, requireAdmin, requireEnv, serve, serviceClient, useQuota } from '../_edge/http.ts';

const JOBS_WORKFLOW = 'jobs.yml';
const DEFAULT_DAILY_CAP = 3;

serve(async (req) => {
  const db = serviceClient();
  await requireAdmin(req, db);

  const settings = await db.from('app_settings').select('key, value').in('key', ['github_dispatch', 'job_scan']);
  if (settings.error) throw new Error(`app_settings: ${settings.error.message}`);
  const value = (key: string): Record<string, unknown> | undefined =>
    settings.data.find((row: { key: string }) => row.key === key)?.value as Record<string, unknown> | undefined;
  const target = value('github_dispatch') as { repo: string; ref: string } | undefined;
  if (!target) throw new Error('app_settings.github_dispatch is missing');
  const configuredCap = Number(value('job_scan')?.daily_cap);
  const cap = Number.isInteger(configuredCap) && configuredCap > 0 ? configuredCap : DEFAULT_DAILY_CAP;

  // Presses are counted per topic; the job board has none, so it uses the first enabled one.
  const topic = await db.from('topics').select('id').eq('enabled', true).order('position').limit(1).maybeSingle();
  if (topic.error || !topic.data) throw new HttpError(409, 'Chưa có chủ đề nào đang bật.');
  // Read the token before using a press, so a missing secret does not cost the admin a daily press.
  const token = requireEnv('GITHUB_DISPATCH_TOKEN');

  await useQuota(db, (topic.data as { id: string }).id, 'jobs', cap, 'Quét ngay');
  const response = await fetch(`https://api.github.com/repos/${target.repo}/actions/workflows/${JOBS_WORKFLOW}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'news-coming-admin',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: target.ref }),
  });
  if (response.status !== 204) throw new HttpError(502, `GitHub từ chối yêu cầu (HTTP ${response.status}).`);
  return json({ ok: true, message: 'Đã gửi yêu cầu quét. Kết quả sẽ có sau khoảng 5–15 phút, tải lại trang để xem.' });
});
