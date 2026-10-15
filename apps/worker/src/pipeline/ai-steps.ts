import { log } from '../log.ts';
import {
  type AiRouter, type PromptTopic, finalScore, preRank, scoringPrompt, scoringSchema, summaryPrompt, summarySchema,
  translationPrompt, translationSchema,
} from '../shared.ts';
import type { EditionStore } from '../store/edition-store.ts';
import type { ArticleRow } from '../types.ts';

// AI stages of an edition. Each stage processes articles in one status and moves them to the next,
// so an interrupted run (quota, error) resumes on the next run without repeating finished work.

export const SCORING_BATCH = 25;
export const SUMMARY_BATCH = 3;
export const TRANSLATION_BATCH = 6;

export interface StepContext {
  readonly store: EditionStore;
  readonly router: AiRouter;
  readonly topic: PromptTopic & { readonly id: string };
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
        aiReason: result.reason.slice(0, 300),
        finalScore: finalScore({ ...article, impact: result.impact }, ctx.now),
        scoredAt: ctx.now,
      });
      scored++;
    }
  }
  return scored;
}

/** Summarizes selected articles whose text is already in `texts`; returns how many were summarized. */
export async function summarizeArticles(ctx: StepContext, articles: readonly ArticleRow[], texts: ReadonlyMap<string, string>): Promise<number> {
  let done = 0;
  for (const batch of batches(articles, SUMMARY_BATCH)) {
    const request = summaryPrompt(batch.map((a, i) => ({
      id: String(i + 1), title: a.title, publisher: a.sourceName, text: texts.get(a.id) ?? a.title,
    })));
    const { data } = await ctx.router.complete('extract', request, summarySchema);
    for (const result of data.items) {
      const article = batch[Number(result.id) - 1];
      if (!article) continue;
      await ctx.store.updateArticle(article.id, { status: 'summarized', summaryEn: result.summary });
      done++;
    }
  }
  return done;
}

export async function translateArticles(ctx: StepContext, articles: readonly ArticleRow[]): Promise<number> {
  let done = 0;
  for (const batch of batches(articles, TRANSLATION_BATCH)) {
    const request = translationPrompt(batch.map((a, i) => ({ id: String(i + 1), title: a.title, summary: a.summaryEn ?? a.title })));
    const { data, providerId } = await ctx.router.complete('translate', request, translationSchema);
    for (const result of data.items) {
      const article = batch[Number(result.id) - 1];
      if (!article) continue;
      await ctx.store.updateArticle(article.id, {
        status: 'translated', titleVi: result.title_vi, summaryVi: result.summary_vi, translatedAt: ctx.now,
      });
      done++;
    }
    log.info('translated batch', { provider: providerId, items: batch.length });
  }
  return done;
}
