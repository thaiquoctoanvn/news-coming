import { log } from '../log.ts';
import {
  type AiRouter, type PromptTopic, finalScore, preRank, scoringPrompt, scoringSchema, summaryPrompt, summarySchema,
  suspiciousTranslationWords, translationPrompt, translationSchema, unsupportedNumbers,
} from '../shared.ts';
import type { EditionStore } from '../store/edition-store.ts';
import type { ArticleRow } from '../types.ts';

// AI stages of an edition. Each stage processes articles in one status and moves them to the next,
// so an interrupted run (quota, error) resumes on the next run without repeating finished work.

export const SCORING_BATCH = 25;
// Long summaries (~350 words) keep each request under Groq's 8K tokens/minute.
export const SUMMARY_BATCH = 2;
export const TRANSLATION_BATCH = 3;

export interface StepContext {
  readonly store: EditionStore;
  readonly router: AiRouter;
  readonly topic: PromptTopic & { readonly id: string; readonly summaryWords: number };
  readonly now: Date;
}

function batches<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}

/** Scores the best pre-ranked raw articles; returns how many were scored. */
export async function scoreArticles(ctx: StepContext, raw: readonly ArticleRow[]): Promise<number> {
  const categoryIds = new Set(ctx.topic.categories.map((c) => c.id));
  const entityIds = new Set(ctx.topic.entities.map((e) => e.id));
  const moduleIds = new Set(ctx.topic.modules.map((m) => m.id));
  let scored = 0;

  for (const batch of batches(preRank(raw, ctx.now), SCORING_BATCH)) {
    const request = scoringPrompt(ctx.topic, batch.map((a, i) => ({
      id: String(i + 1), title: a.title, publisher: a.sourceName, description: a.description,
    })));
    const { data } = await ctx.router.complete('extract', request, scoringSchema);
    for (const result of data.items) {
      const article = batch[Number(result.id) - 1];
      if (!article) continue;
      const categoryId = result.category && categoryIds.has(result.category) ? result.category : article.categoryId;
      await ctx.store.updateArticle(article.id, {
        status: 'scored',
        categoryId,
        entityId: result.entity && entityIds.has(result.entity) ? result.entity : article.entityId,
        impact: result.impact,
        direction: result.direction,
        explains: result.explains && moduleIds.has(result.explains) ? result.explains : null,
        storyKey: result.story,
        aiReason: result.reason.slice(0, 300),
        finalScore: finalScore({ ...article, impact: result.impact }, ctx.now),
        scoredAt: ctx.now,
      });
      scored++;
    }
  }
  return scored;
}

/** Text the summary must stay faithful to: the article's own title and body. */
function sourceText(a: ArticleRow): string {
  return a.contentSnippet ?? [a.title, a.description].filter(Boolean).join('. ');
}

export interface StepCounts {
  readonly done: number;
  /** Items that failed a faithfulness check twice; marked failed and never published. */
  readonly rejected: number;
}

/** Summarizes selected articles from their own text (content-integrity rules). */
export async function summarizeArticles(ctx: StepContext, articles: readonly ArticleRow[]): Promise<StepCounts> {
  let done = 0;
  let rejected = 0;
  for (const batch of batches(articles, SUMMARY_BATCH)) {
    for (const [article, summary] of await summarizeBatch(ctx, batch)) {
      let final = summary;
      let invented = unsupportedNumbers(final, `${article.title} ${sourceText(article)}`);
      if (invented.length > 0) {
        const retry = await summarizeBatch(ctx, [article], `it contains numbers that are not in the text (${invented.join(', ')})`);
        final = retry.get(article) ?? final;
        invented = unsupportedNumbers(final, `${article.title} ${sourceText(article)}`);
      }
      if (invented.length > 0) {
        rejected++;
        log.warn('summary rejected: numbers not in source', { articleId: article.id, numbers: invented });
        await ctx.store.updateArticle(article.id, { status: 'failed', error: `unfaithful summary: numbers ${invented.join(', ')} not in source` });
        continue;
      }
      await ctx.store.updateArticle(article.id, { status: 'summarized', summaryEn: final });
      done++;
    }
  }
  return { done, rejected };
}

async function summarizeBatch(ctx: StepContext, batch: readonly ArticleRow[], feedback?: string): Promise<Map<ArticleRow, string>> {
  const request = summaryPrompt(batch.map((a, i) => ({
    id: String(i + 1), title: a.title, publisher: a.sourceName, text: sourceText(a),
  })), ctx.topic.summaryWords, feedback);
  const { data } = await ctx.router.complete('extract', request, summarySchema);
  const results = new Map<ArticleRow, string>();
  for (const result of data.items) {
    const article = batch[Number(result.id) - 1];
    if (article) results.set(article, result.summary);
  }
  return results;
}

export async function translateArticles(ctx: StepContext, articles: readonly ArticleRow[]): Promise<StepCounts> {
  let done = 0;
  let rejected = 0;
  for (const batch of batches(articles, TRANSLATION_BATCH)) {
    for (const [article, result] of await translateBatch(ctx, batch)) {
      // A translation with altered numbers or garbled words gets one more try on its own.
      const first = translationProblems(article, result);
      const needsRetry = first.numbers.length > 0 || first.garbled.length > 0;
      const final = needsRetry ? (await translateBatch(ctx, [article])).get(article) ?? result : result;
      const problems = translationProblems(article, final);
      if (problems.numbers.length > 0) {
        rejected++;
        log.warn('translation rejected: numbers not in summary', { articleId: article.id, numbers: problems.numbers });
        await ctx.store.updateArticle(article.id, { status: 'failed', error: `unfaithful translation: numbers ${problems.numbers.join(', ')}` });
        continue;
      }
      if (problems.garbled.length > 0) log.warn('translation still has suspicious words', { articleId: article.id, words: problems.garbled });
      await ctx.store.updateArticle(article.id, {
        status: 'translated', titleVi: final.title_vi, summaryVi: final.summary_vi, translatedAt: ctx.now,
      });
      done++;
    }
  }
  return { done, rejected };
}

interface Translation {
  readonly title_vi: string;
  readonly summary_vi: string;
}

async function translateBatch(ctx: StepContext, batch: readonly ArticleRow[]): Promise<Map<ArticleRow, Translation>> {
  const request = translationPrompt(batch.map((a, i) => ({ id: String(i + 1), title: a.title, summary: a.summaryEn ?? a.title })));
  const { data, providerId } = await ctx.router.complete('translate', request, translationSchema);
  log.info('translated batch', { provider: providerId, items: batch.length });
  const results = new Map<ArticleRow, Translation>();
  for (const result of data.items) {
    const article = batch[Number(result.id) - 1];
    if (article) results.set(article, result);
  }
  return results;
}

function translationProblems(article: ArticleRow, t: Translation): { numbers: string[]; garbled: string[] } {
  const english = `${article.title} ${article.summaryEn ?? ''}`;
  const vietnamese = `${t.title_vi} ${t.summary_vi}`;
  return { numbers: unsupportedNumbers(vietnamese, english), garbled: suspiciousTranslationWords(vietnamese, english) };
}
