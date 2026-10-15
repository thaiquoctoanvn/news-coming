import { z } from 'zod';
import type { ChatRequest } from './ai/providers.ts';

// Prompts are built from topic configuration, so new topics need no code (DESIGN.md §2.2).
// Inputs use short ids ("1", "2", …) to save tokens; callers map them back to article ids.

const DESCRIPTION_CHARS = 200;
const ARTICLE_TEXT_CHARS = 8_000;
const TOKENS_PER_WORD = 1.5;

export interface PromptRef {
  readonly id: string;
  readonly name: string;
  /** English hint for the model, e.g. "U.S. Treasury Department actions, NOT bond yields". */
  readonly description?: string | null;
}

export interface PromptTopic {
  readonly name: string;
  readonly scoringGuide: string;
  readonly categories: readonly PromptRef[];
  readonly entities: readonly PromptRef[];
  readonly modules: readonly PromptRef[];
}

const listRefs = (refs: readonly PromptRef[]): string =>
  refs.map((r) => `- ${r.id}: ${r.name}${r.description ? ` — ${r.description}` : ''}`).join('\n') || '- (none)';

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
      story: z.string().catch('').transform(normalizeStoryKey),
      reason: z.string().catch(''),
    }),
  ),
});
export type ScoringOutput = z.infer<typeof scoringSchema>;

/** Lowercase slug; null when the model gave nothing usable. */
export function normalizeStoryKey(value: string): string | null {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return slug.length >= 3 ? slug : null;
}

export function scoringPrompt(topic: PromptTopic, items: readonly ScoringInput[]): ChatRequest {
  const system = [
    `You score news items for a Vietnamese investor digest on the topic "${topic.name}".`,
    topic.scoringGuide,
    `Categories (use the id):\n${listRefs(topic.categories)}`,
    `Tracked entities (use the id, or null):\n${listRefs(topic.entities)}`,
    `Data series an item may explain the move of ("explains", or null):\n${listRefs(topic.modules)}`,
    '"story" = short English slug of the underlying event, identical for every item about the same event '
      + '(e.g. "us-cpi-sep-2026", "strategy-buys-btc-oct-12", "oil-hormuz-tanker-attacks").',
    'Answer with JSON only: {"items":[{"id":"1","category":"<id>","entity":null,"impact":0,"direction":"neutral","explains":null,"story":"<slug>","reason":"<max 15 words>"}]}',
    'Return exactly one entry per input id. Use only the ids listed above.',
  ].join('\n\n');
  const user = items
    .map((i) => `${i.id} | ${i.publisher} | ${i.title}${i.description ? ` | ${i.description.slice(0, DESCRIPTION_CHARS)}` : ''}`)
    .join('\n');
  return { system, user, maxOutputTokens: 75 * items.length + 1_000 };
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

/**
 * `targetWords`: summary length for a normal article (~3 minutes of reading once translated).
 * `feedback`: on a retry, what the previous attempt got wrong.
 * Faithfulness rules: .agents/rules/content-integrity.md.
 */
export function summaryPrompt(items: readonly SummaryInput[], targetWords: number, feedback?: string): ChatRequest {
  const system = [
    'You summarize financial news articles in English for a market digest read by Vietnamese investors.',
    'STRICT RULE: the summary must be faithful to the article text. Use ONLY facts stated in the text below each title.',
    'Do not add outside knowledge, background, assumptions, speculation, or your own analysis. Do not invent numbers, quotes, names, dates or causes.',
    'Copy numbers, percentages, prices, dates and quotes exactly as written in the text.',
    'Mention market impact, outlook or what to watch ONLY if the text itself says so, and attribute it (e.g. "analysts at X expect...").',
    `Length: about ${targetWords} words in 3-5 short paragraphs separated by a blank line. If the text is short, write a proportionally shorter summary — never pad.`,
    ...(feedback ? [`Your previous summary broke the rule: ${feedback}. Rewrite it using only the text.`] : []),
    'Answer with JSON only: {"items":[{"id":"1","summary":"..."}]}',
  ].join('\n');
  const user = items
    .map((i) => `### ${i.id}\nTitle: ${i.title}\nPublisher: ${i.publisher}\nText:\n${i.text.slice(0, ARTICLE_TEXT_CHARS)}`)
    .join('\n\n');
  return { system, user, maxOutputTokens: Math.ceil(targetWords * TOKENS_PER_WORD * items.length) + 600 };
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
    'Keep the paragraph breaks of the summary. Every word must be proper Vietnamese or an unchanged proper name/ticker:',
    'never leave English words untranslated and never glue an English word to a Vietnamese one.',
    'STRICT RULE: translate faithfully — add nothing, drop nothing, change no number, date or name. Write numbers with digits exactly as in the English.',
    'Answer with JSON only: {"items":[{"id":"1","title_vi":"...","summary_vi":"..."}]}',
  ].join('\n');
  const user = JSON.stringify(items.map((i) => ({ id: i.id, title: i.title, summary: i.summary })));
  const words = items.reduce((sum, i) => sum + i.summary.split(/\s+/).length + i.title.split(/\s+/).length, 0);
  return { system, user, maxOutputTokens: Math.ceil(words * 2.5) + 500 };
}

/**
 * Latin-only words of 7+ letters in a Vietnamese translation that do not occur in the English source
 * usually mean a garbled output ("trongani", "canengagement"). Returns those words.
 */
export function suspiciousTranslationWords(vietnamese: string, english: string): string[] {
  const source = new Set(english.toLowerCase().match(/[a-z]+/g) ?? []);
  const words = vietnamese.match(/(?<![\p{L}])[A-Za-z]{7,}(?![\p{L}])/gu) ?? [];
  return words.filter((w) => !source.has(w.toLowerCase()));
}
