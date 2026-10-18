import { z } from 'zod';
import type { ChatRequest } from './ai/providers.ts';

// "AI gợi ý" on the config page: suggests filter keywords and the scoring-model description of a
// category from the admin's own notes. Suggestions are only shown; the admin picks and saves them.

export const BRIEF_MAX_CHARS = 600;
const MAX_KEYWORDS = 20;
const MAX_EXCLUDES = 8;
const MAX_KEYWORD_CHARS = 40;
const MAX_DESCRIPTION_CHARS = 300;

export interface AssistInput {
  readonly topicName: string;
  readonly topicDescription: string | null;
  readonly categoryName: string;
  readonly categoryId: string;
  readonly brief: string;
  readonly keywords: readonly string[];
  readonly excludeKeywords: readonly string[];
  readonly description: string | null;
}

export interface AssistSuggestion {
  readonly keywords: string[];
  readonly excludeKeywords: string[];
  readonly description: string;
}

export const assistSchema = z.object({
  keywords: z.array(z.string()).default([]),
  exclude_keywords: z.array(z.string()).default([]),
  description: z.string().default(''),
});

const list = (items: readonly string[]): string => (items.length > 0 ? items.join(', ') : '(none)');

export function buildCategoryAssistPrompt(input: AssistInput): ChatRequest {
  return {
    system: [
      'You configure the keyword filter of a news digest about finance and geopolitics.',
      'Articles are in English (RSS feeds and Google News). A category keyword matches a whole word or phrase',
      'in the article title or description, case-insensitive, plural "s"/"es" allowed; a trailing "*" matches a word prefix.',
      'Keywords decide which articles are sent to the AI scorer, so they must be specific to the category.',
    ].join(' '),
    user: [
      `Topic: ${input.topicName}${input.topicDescription ? ` — ${input.topicDescription}` : ''}`,
      `Category: ${input.categoryName} (id: ${input.categoryId})`,
      `Admin notes (may be Vietnamese): ${input.brief}`,
      `Current keywords: ${list(input.keywords)}`,
      `Current exception keywords: ${list(input.excludeKeywords)}`,
      `Current description: ${input.description ?? '(none)'}`,
      '',
      'Suggest, following the admin notes:',
      `- "keywords": 8-${MAX_KEYWORDS} English keywords or short phrases (max 4 words, lowercase) that news in this category uses; avoid words that also fit other categories.`,
      `- "exclude_keywords": 0-${MAX_EXCLUDES} phrases that contain one of the keywords but are NOT about this category (e.g. "olive oil" for an oil category).`,
      '- "description": 1-2 English sentences telling the scoring model which news belongs to this category and what does not.',
      'Answer with JSON only: {"keywords":[],"exclude_keywords":[],"description":""}',
    ].join('\n'),
    maxOutputTokens: 600,
  };
}

/** Keeps short, distinct, lowercase keywords; drops ones the category already has. */
export function cleanKeywords(items: readonly string[], existing: readonly string[], max: number): string[] {
  const known = new Set(existing.map((k) => k.trim().toLowerCase()));
  const out: string[] = [];
  for (const raw of items) {
    const keyword = raw.trim().toLowerCase().replace(/\s+/g, ' ').replace(/^["']|["']$/g, '');
    if (!keyword || keyword.length > MAX_KEYWORD_CHARS || keyword.includes(',') || known.has(keyword)) continue;
    known.add(keyword);
    out.push(keyword);
    if (out.length >= max) break;
  }
  return out;
}

export function cleanSuggestion(raw: z.infer<typeof assistSchema>, input: AssistInput): AssistSuggestion {
  return {
    keywords: cleanKeywords(raw.keywords, input.keywords, MAX_KEYWORDS),
    excludeKeywords: cleanKeywords(raw.exclude_keywords, input.excludeKeywords, MAX_EXCLUDES),
    description: raw.description.trim().replace(/\s+/g, ' ').slice(0, MAX_DESCRIPTION_CHARS),
  };
}
