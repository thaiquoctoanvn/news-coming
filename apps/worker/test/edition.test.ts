import { describe, expect, test } from 'vitest';
import { localDate, runEdition } from '../src/pipeline/edition.ts';
import type { AiProvider } from '../src/shared.ts';
import type { EditionConfig } from '../src/store/edition-store.ts';
import { MemoryStore } from '../src/store/memory-store.ts';
import type { RawItem, Source, TopicConfig } from '../src/types.ts';
import { MemoryEditionStore } from './helpers/memory-edition-store.ts';

const NOW = new Date();
const hoursAgo = (h: number): Date => new Date(NOW.getTime() - h * 3_600_000);

const news: Source = {
  id: 'gn', name: 'Google News', kind: 'google_news', url: null, query: 'q',
  defaultCategoryId: null, defaultEntityId: null, authority: 0,
};

const topicConfig: TopicConfig = {
  id: 'macro_finance', excludeKeywords: [], sources: [news],
  categories: [
    { id: 'oil', keywords: ['oil'], excludeKeywords: [], position: 1 },
    { id: 'fed', keywords: ['fed'], excludeKeywords: [], position: 2 },
  ],
  entities: [],
};

const editionConfig: EditionConfig = {
  topic: { id: 'macro_finance', name: 'Macro', scoringGuide: 'guide', aiDailyRequestCap: 60, pin: { minImpact: 9, direction: 'negative', max: 3 } },
  edition: { id: 'morning', timezone: 'Asia/Ho_Chi_Minh', sizeMax: 3 },
  slots: [
    { id: 'oil', position: 1, kind: 'category', categoryIds: ['oil'], entityIds: [], maxItems: 1, minScore: 40, extraItemMinScore: null, attachModules: [] },
    { id: 'rest', position: 6, kind: 'fill', categoryIds: [], entityIds: [], maxItems: 12, minScore: 50, extraItemMinScore: null, attachModules: [] },
  ],
  categories: [{ id: 'oil', name: 'Dầu' }, { id: 'fed', name: 'FED' }],
  entities: [],
  modules: [],
};

const providers: AiProvider[] = [
  { id: 'groq', role: 'extract', provider: 'groq', model: 'm', priority: 1, dailyRequestLimit: 1000, dailyTokenLimit: null, rpmLimit: 30, tpmLimit: null, requestOptions: {} },
  { id: 'gemini', role: 'translate', provider: 'gemini', model: 'g', priority: 1, dailyRequestLimit: 500, dailyTokenLimit: null, rpmLimit: 15, tpmLimit: null, requestOptions: {} },
];

const items: RawItem[] = [
  { url: 'https://news.example/1', title: 'Oil supply shock as tankers attacked', publisher: 'A', publishedAt: hoursAgo(1) },
  { url: 'https://news.example/2', title: 'Fed signals rate cut path', publisher: 'B', publishedAt: hoursAgo(2) },
  { url: 'https://news.example/3', title: 'Fed official speaks about inflation', publisher: 'C', publishedAt: hoursAgo(3) },
  { url: 'https://news.example/4', title: 'Oil traders weigh demand outlook', publisher: 'D', publishedAt: hoursAgo(4) },
];

// Fake AI: scores by keyword, summarizes and translates deterministically.
function fakeAi(options: { translateStatus?: number } = {}) {
  const calls: string[] = [];
  const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    if (url.includes('groq')) {
      const user = (body.messages as { content: string }[])[1]!.content;
      const system = (body.messages as { content: string }[])[0]!.content;
      calls.push(system.includes('score') ? 'score' : 'summary');
      const content = system.includes('score') ? scoreAnswer(user) : summaryAnswer(user);
      return Response.json({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    }
    if (url.includes('generativelanguage')) {
      calls.push('translate');
      if (options.translateStatus) return new Response('quota', { status: options.translateStatus });
      const user = (body.contents as { parts: { text: string }[] }[])[0]!.parts[0]!.text;
      const input = JSON.parse(user) as { id: string; title: string }[];
      const text = JSON.stringify({ items: input.map((i) => ({ id: i.id, title_vi: `VI ${i.title}`, summary_vi: 'Tóm tắt' })) });
      return Response.json({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 } });
    }
    return new Response('blocked', { status: 403 }); // article pages: fall back to title
  };
  return { calls, fetchImpl };
}

function scoreAnswer(user: string): string {
  const scored = user.split('\n').map((line) => {
    const [id, , title = ''] = line.split(' | ');
    const isOil = title.includes('Oil');
    const impact = title.includes('shock') ? 9 : title.includes('rate cut') ? 7 : 4;
    return { id, category: isOil ? 'oil' : 'fed', entity: null, impact, direction: title.includes('shock') ? 'negative' : 'neutral', explains: null, reason: 'r' };
  });
  return JSON.stringify({ items: scored });
}

function summaryAnswer(user: string): string {
  const ids = [...user.matchAll(/^### (\d+)$/gm)].map((m) => m[1]);
  return JSON.stringify({ items: ids.map((id) => ({ id, summary: `Summary ${id}` })) });
}

function setup(ai = fakeAi()) {
  const store = new MemoryStore([topicConfig]);
  const editionStore = new MemoryEditionStore(store, editionConfig, providers);
  const run = () => runEdition({
    store, editionStore, topicId: 'macro_finance', editionId: 'morning', trigger: 'manual',
    fetchSource: async () => items, keys: { groq: 'k', gemini: 'k' }, fetchImpl: ai.fetchImpl, now: NOW,
  });
  return { store, editionStore, run, ai };
}

describe('runEdition', () => {
  test('collects, scores, selects, summarizes and translates a digest', async () => {
    const { editionStore, run, ai } = setup();

    const result = await run();

    expect(result.status).toBe('success');
    expect(result.stats).toMatchObject({ scored: 4, selected: 3, summarized: 3, translated: 3, aiStopped: null });
    const [digest] = editionStore.digests;
    expect(digest?.digestDate).toBe(localDate(NOW, 'Asia/Ho_Chi_Minh'));
    const titleOf = (id: string) => editionStore.rows().find((a) => a.id === id)?.title;
    expect(digest?.items.map((i) => [titleOf(i.articleId), i.slotId, i.isPinned])).toEqual([
      ['Oil supply shock as tankers attacked', null, true],
      ['Oil traders weigh demand outlook', 'oil', false],
      ['Fed signals rate cut path', 'rest', false],
    ]);
    const translated = editionStore.rows().filter((a) => a.status === 'translated');
    expect(translated.map((a) => a.titleVi).sort()).toEqual([
      'VI Fed signals rate cut path', 'VI Oil supply shock as tankers attacked', 'VI Oil traders weigh demand outlook',
    ]);
    expect(translated.every((a) => a.contentSnippet === `${a.title}`)).toBe(true); // pages blocked → title fallback
    expect(ai.calls).toEqual(['score', 'summary', 'translate']);
    expect(editionStore.usage).toHaveLength(3);
  });

  test('stops at the translation quota, then finishes pending work on the next run', async () => {
    const blocked = setup(fakeAi({ translateStatus: 429 }));

    const first = await blocked.run();

    expect(first.status).toBe('partial');
    expect(first.stats).toMatchObject({ summarized: 3, translated: 0 });
    expect(first.stats?.aiStopped).toContain('No translate provider available');

    const resumed = new MemoryEditionStore(blocked.store, editionConfig, providers);
    resumed.patches = blocked.editionStore.patches;
    resumed.digests = blocked.editionStore.digests;
    const second = await runEdition({
      store: blocked.store, editionStore: resumed, topicId: 'macro_finance', editionId: 'morning', trigger: 'manual',
      fetchSource: async () => items, keys: { groq: 'k', gemini: 'k' }, fetchImpl: fakeAi().fetchImpl, now: NOW,
    });

    expect(second.stats).toMatchObject({ scored: 0, selected: 0, summarized: 0, translated: 3 });
    expect(resumed.digests).toHaveLength(1);
  });

  test('skips disabled editions', async () => {
    const { store } = setup();
    const result = await runEdition({
      store, editionStore: new MemoryEditionStore(store, editionConfig, providers), topicId: 'macro_finance',
      editionId: 'pre_us', trigger: 'manual', fetchSource: async () => items, keys: {}, now: NOW,
    });

    expect(result).toEqual({ status: 'skipped', stats: null });
  });
});
