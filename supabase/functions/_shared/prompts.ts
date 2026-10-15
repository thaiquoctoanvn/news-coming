import { z } from 'zod';
import type { ChatRequest } from './ai/providers.ts';

// Prompts are built from topic configuration, so new topics need no code (DESIGN.md §2.2).
// Inputs use short ids ("1", "2", …) to save tokens; callers map them back to article ids.

const DESCRIPTION_CHARS = 200;
const ARTICLE_TEXT_CHARS = 2_400;

export interface PromptTopic {
  readonly name: string;
  readonly scoringGuide: string;
  readonly categories: readonly { readonly id: string; readonly name: string }[];
  readonly entities: readonly { readonly id: string; readonly name: string }[];
  readonly modules: readonly { readonly id: string; readonly name: string }[];
}

// ---------- Scoring ----------

export interface ScoringInput {
  readonly id: string;
  readonly title: string;
  readonly publisher: string;
  readonly description: string | null;
}

const nullableId = z.preprocess((v) => (v === '' || v === 'null' || v === 'none' ? null : v), z.string().nullable());

export const scoringSchema = z.object({
  items: z.array(
    z.object({
      id: z.coerce.string(),
      category: nullableId,
      entity: nullableId.optional().default(null),
      impact: z.coerce.number().transform((n) => Math.max(0, Math.min(10, Math.round(n)))),
      direction: z.enum(['negative', 'neutral', 'positive']).catch('neutral'),
      explains: nullableId.optional().default(null),
      reason: z.string().catch(''),
    }),
  ),
});
export type ScoringOutput = z.infer<typeof scoringSchema>;

export function scoringPrompt(topic: PromptTopic, items: readonly ScoringInput[]): ChatRequest {
  const list = (entries: PromptTopic['categories']): string => entries.map((e) => `- ${e.id}: ${e.name}`).join('\n') || '- (none)';
  const system = [
    `You score news items for a Vietnamese investor digest on the topic "${topic.name}".`,
    topic.scoringGuide,
    `Categories (use the id):\n${list(topic.categories)}`,
    `Tracked entities (use the id, or null):\n${list(topic.entities)}`,
    `Data series an item may explain the move of ("explains", or null):\n${list(topic.modules)}`,
    'Answer with JSON only: {"items":[{"id":"1","category":"<id>","entity":null,"impact":0,"direction":"neutral","explains":null,"reason":"<max 15 words>"}]}',
    'Return exactly one entry per input id. Use only the ids listed above.',
  ].join('\n\n');
  const user = items
    .map((i) => `${i.id} | ${i.publisher} | ${i.title}${i.description ? ` | ${i.description.slice(0, DESCRIPTION_CHARS)}` : ''}`)
    .join('\n');
  return { system, user, maxOutputTokens: 60 * items.length + 1_000 };
}

// ---------- Summaries ----------

export interface SummaryInput {
  readonly id: string;
  readonly title: string;
  readonly publisher: string;
  readonly text: string;
}

export const summarySchema = z.object({
  items: z.array(z.object({ id: z.coerce.string(), summary: z.string().min(1) })),
});

export function summaryPrompt(items: readonly SummaryInput[]): ChatRequest {
  const system = [
    'You write short English summaries of financial news for a market digest.',
    'For each item: 2-3 sentences, at most 60 words, factual and neutral. Keep numbers, tickers, names and dates.',
    'If the text is only a headline, state what the headline says without inventing details.',
    'Answer with JSON only: {"items":[{"id":"1","summary":"..."}]}',
  ].join('\n');
  const user = items
    .map((i) => `### ${i.id}\nTitle: ${i.title}\nPublisher: ${i.publisher}\nText: ${i.text.slice(0, ARTICLE_TEXT_CHARS)}`)
    .join('\n\n');
  return { system, user, maxOutputTokens: 150 * items.length + 600 };
}

// ---------- Translation ----------

export interface TranslationInput {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
}

export const translationSchema = z.object({
  items: z.array(z.object({ id: z.coerce.string(), title_vi: z.string().min(1), summary_vi: z.string().min(1) })),
});

export function translationPrompt(items: readonly TranslationInput[]): ChatRequest {
  const system = [
    'Translate financial news titles and summaries from English to Vietnamese for Vietnamese investors.',
    'Use natural, concise Vietnamese financial language. Keep tickers, company and fund names, numbers and units ($, %, bps) unchanged.',
    'Preferred terms: Federal Reserve/Fed → FED; Treasury yields → lợi suất trái phiếu Kho bạc Mỹ; JGB → trái phiếu chính phủ Nhật (JGB);',
    'basis points → điểm cơ bản; rate cut/hike → cắt giảm/tăng lãi suất; stablecoin, ETF, token hóa (tokenization) giữ nguyên.',
    'Answer with JSON only: {"items":[{"id":"1","title_vi":"...","summary_vi":"..."}]}',
  ].join('\n');
  const user = JSON.stringify(items.map((i) => ({ id: i.id, title: i.title, summary: i.summary })));
  return { system, user, maxOutputTokens: 400 * items.length + 400 };
}
