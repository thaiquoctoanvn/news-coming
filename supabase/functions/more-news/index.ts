// "Xem thêm" (DESIGN.md §6): adds a few more readable items to a digest, summarized and translated
// with the same faithfulness checks as the worker. Admin only, limited presses per day.
import { z } from 'zod';
import { AiRouter } from '../_shared/ai/router.ts';
import { consoleLogger } from '../_shared/log.ts';
import { addMoreToDigest } from '../_shared/pipeline/more.ts';
import { ArticleReader } from '../_shared/pipeline/reader.ts';
import { createSupabaseEditionStore } from '../_shared/pipeline/supabase-edition-store.ts';
import { HttpError, json, readJson, requireAdmin, requireEnv, serve, serviceClient, useQuota } from '../_edge/http.ts';

const bodySchema = z.object({ digestId: z.uuid() });

serve(async (req) => {
  const db = serviceClient();
  await requireAdmin(req, db);
  const parsed = bodySchema.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, 'Thiếu digestId.');

  const store = createSupabaseEditionStore(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
  const digest = await store.loadDigest(parsed.data.digestId);
  if (!digest) throw new HttpError(404, 'Không tìm thấy bản tin.');
  const config = await store.loadEditionConfig(digest.topicId, digest.editionId);
  if (!config) throw new HttpError(409, 'Chủ đề hoặc bản tin đang tắt.');
  await useQuota(db, digest.topicId, 'more', config.topic.dailyCapMore, 'Xem thêm');

  const router = new AiRouter({
    providers: await store.loadAiProviders(),
    keys: { groq: Deno.env.get('GROQ_API_KEY'), gemini: Deno.env.get('GEMINI_API_KEY') },
    usage: store,
    topicId: digest.topicId,
    topicDailyCap: config.topic.aiDailyRequestCap,
    onEvent: (message, fields) => consoleLogger.warn(message, fields),
  });
  const result = await addMoreToDigest({
    store, router, reader: new ArticleReader({ fetchImpl: fetch }), log: consoleLogger, digestId: digest.id, now: new Date(),
  });
  return json({ ok: true, ...result });
});
