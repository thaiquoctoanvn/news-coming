// "AI gợi ý" (DESIGN.md §11): suggests keywords and the AI description of a category from the
// admin's notes. Nothing is saved here; the admin reviews the suggestions and saves with OK.
import { z } from 'zod';
import { AiRouter } from '../_shared/ai/router.ts';
import { BRIEF_MAX_CHARS, assistSchema, buildCategoryAssistPrompt, cleanSuggestion } from '../_shared/category-assist.ts';
import { consoleLogger } from '../_shared/log.ts';
import { createSupabaseEditionStore } from '../_shared/pipeline/supabase-edition-store.ts';
import { HttpError, json, readJson, requireAdmin, requireEnv, serve, serviceClient, useQuota } from '../_edge/http.ts';

const DEFAULT_DAILY_CAP = 10;

// An existing category is read by id; a new one (add popup, not saved yet) only has its name.
const bodySchema = z.object({
  topicId: z.string().min(1).max(64),
  categoryId: z.string().min(1).max(64).optional(),
  categoryName: z.string().trim().min(1).max(80).optional(),
  brief: z.string().trim().min(3).max(BRIEF_MAX_CHARS),
}).refine((b) => b.categoryId || b.categoryName);

type CategoryRow = { name_vi: string; keywords: string[] | null; exclude_keywords: string[] | null; description_en: string | null };

serve(async (req) => {
  const db = serviceClient();
  await requireAdmin(req, db);
  const parsed = bodySchema.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, `Mô tả cần từ 3 đến ${BRIEF_MAX_CHARS} ký tự.`);
  const { topicId, categoryId, categoryName, brief } = parsed.data;

  const [topic, category] = await Promise.all([
    db.from('topics').select('name_vi, description_vi, ai_daily_request_cap, settings').eq('id', topicId).maybeSingle(),
    categoryId
      ? db.from('categories').select('name_vi, keywords, exclude_keywords, description_en').eq('topic_id', topicId).eq('id', categoryId).maybeSingle()
      : Promise.resolve({ data: { name_vi: categoryName!, keywords: [], exclude_keywords: [], description_en: null } as CategoryRow, error: null }),
  ]);
  if (topic.error || category.error) throw new Error(topic.error?.message ?? category.error?.message);
  if (!topic.data || !category.data) throw new HttpError(404, 'Không tìm thấy danh mục.');
  const settings = (topic.data.settings ?? {}) as { daily_cap_assist?: number };
  await useQuota(db, topicId, 'assist', settings.daily_cap_assist ?? DEFAULT_DAILY_CAP, 'AI gợi ý');

  const store = createSupabaseEditionStore(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
  const router = new AiRouter({
    providers: await store.loadAiProviders(),
    keys: { groq: Deno.env.get('GROQ_API_KEY'), gemini: Deno.env.get('GEMINI_API_KEY') },
    usage: store,
    topicId,
    topicDailyCap: topic.data.ai_daily_request_cap,
    onEvent: (message, fields) => consoleLogger.warn(message, fields),
  });
  const input = {
    topicName: topic.data.name_vi,
    topicDescription: topic.data.description_vi,
    categoryName: category.data.name_vi,
    categoryId: categoryId ?? '(new)',
    brief,
    keywords: category.data.keywords ?? [],
    excludeKeywords: category.data.exclude_keywords ?? [],
    description: category.data.description_en,
  };
  try {
    const { data } = await router.complete('extract', buildCategoryAssistPrompt(input), assistSchema);
    return json({ ok: true, ...cleanSuggestion(data, input) });
  } catch (error: unknown) {
    consoleLogger.warn('category assist failed', { error: error instanceof Error ? error.message : String(error) });
    throw new HttpError(503, 'AI đang hết lượt hoặc bận, vui lòng thử lại sau.');
  }
});
