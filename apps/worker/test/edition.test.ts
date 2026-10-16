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
  topic: {
    id: 'macro_finance', name: 'Macro', scoringGuide: 'guide', aiDailyRequestCap: 60,
    pin: { minImpact: 9, direction: 'negative', max: 3 }, summaryWords: 350,
  },
  edition: { id: 'morning', timezone: 'Asia/Ho_Chi_Minh', sizeMax: 3, runModules: false },
  slots: [
    { id: 'oil', position: 1, kind: 'category', categoryIds: ['oil'], entityIds: [], maxItems: 1, minScore: 40, extraItemMinScore: null, attachModules: [] },
    { id: 'rest', position: 6, kind: 'fill', categoryIds: [], entityIds: [], maxItems: 12, minScore: 40, extraItemMinScore: null, attachModules: [] },
  ],
  categories: [{ id: 'oil', name: 'Dầu' }, { id: 'fed', name: 'FED' }],
  entities: [],
  modules: [],
};

const providers: AiProvider[] = [
  { id: 'groq', role: 'extract', provider: 'groq', model: 'm', priority: 1, dailyRequestLimit: 1000, dailyTokenLimit: null, rpmLimit: 30, tpmLimit: null, requestOptions: {} },
  { id: 'gemini', role: 'translate', provider: 'gemini', model: 'g', priority: 1, dailyRequestLimit: 500, dailyTokenLimit: null, rpmLimit: 15, tpmLimit: null, requestOptions: {} },
];

const READABLE_PAGE = [
  'Title: Article', '', 'Markdown Content:',
  'Prices moved sharply on Thursday as traders reacted to new information about supply and demand. '.repeat(8),
].join('\n');

const items: RawItem[] = [
  { url: 'https://news.example/1', title: 'Oil supply shock as tankers attacked', publisher: 'A', publishedAt: hoursAgo(1) },
  { url: 'https://news.example/2', title: 'Fed signals rate cut path', publisher: 'B', publishedAt: hoursAgo(2) },
  { url: 'https://news.example/3', title: 'Fed official speaks about inflation', publisher: 'C', publishedAt: hoursAgo(3) },
  { url: 'https://news.example/4', title: 'Oil traders weigh demand outlook', publisher: 'D', publishedAt: hoursAgo(4) },
];

// Fake AI and Jina: scores by keyword, summarizes and translates deterministically.
function fakeServices(options: { translateStatus?: number; unreadable?: readonly string[]; inventNumbers?: boolean } = {}) {
  const calls: string[] = [];
  const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
    if (url.startsWith('https://r.jina.ai/')) {
      calls.push('jina');
      const target = url.slice('https://r.jina.ai/'.length);
      return options.unreadable?.includes(target) ? new Response('Title: \n\nMarkdown Content:\n', { status: 200 }) : new Response(READABLE_PAGE);
    }
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    if (url.includes('groq')) {
      const [system, user] = (body.messages as { content: string }[]).map((m) => m.content);
      const isScoring = system!.includes('score');
      calls.push(isScoring ? 'score' : 'summary');
      const content = isScoring ? scoreAnswer(user!) : summaryAnswer(user!, options.inventNumbers ?? false);
      return Response.json({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    }
    calls.push('translate');
    if (options.translateStatus) return new Response('quota', { status: options.translateStatus });
    const user = (body.contents as { parts: { text: string }[] }[])[0]!.parts[0]!.text;
    const input = JSON.parse(user) as { id: string; title: string }[];
    const text = JSON.stringify({ items: input.map((i) => ({ id: i.id, title_vi: `VI ${i.title}`, summary_vi: 'Tóm tắt' })) });
    return Response.json({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 } });
  };
  return { calls, fetchImpl };
}

function scoreAnswer(user: string): string {
  const scored = user.split('\n').map((line) => {
    const [id, , title = ''] = line.split(' | ');
    const impact = title.includes('shock') ? 9 : title.includes('rate cut') ? 7 : 5;
    return {
      id, category: title.includes('Oil') ? 'oil' : 'fed', entity: null, impact,
      direction: title.includes('shock') ? 'negative' : 'neutral', explains: null, story: title, reason: 'r',
    };
  });
  return JSON.stringify({ items: scored });
}

function summaryAnswer(user: string, inventNumbers: boolean): string {
  const ids = [...user.matchAll(/^### (\d+)$/gm)].map((m) => m[1]);
  const summary = inventNumbers ? 'Prices jumped 42% overnight.' : 'Prices moved sharply as traders reacted to supply news.';
  return JSON.stringify({ items: ids.map((id) => ({ id, summary })) });
}

function setup(services = fakeServices(), sourceItems: readonly RawItem[] = items) {
  const store = new MemoryStore([topicConfig]);
  const editionStore = new MemoryEditionStore(store, editionConfig, providers);
  const run = (edition = editionStore, fetchImpl = services.fetchImpl) => runEdition({
    store, editionStore: edition, topicId: 'macro_finance', editionId: 'morning', trigger: 'manual',
    fetchSource: async () => [...sourceItems], keys: { groq: 'k', gemini: 'k' }, fetchImpl, now: NOW, sleep: async () => {},
  });
  return { store, editionStore, run, services };
}

const digestTitles = (editionStore: MemoryEditionStore): (string | undefined)[] => {
  const rows = editionStore.rows();
  return editionStore.digests[0]?.items.map((i) => rows.find((a) => a.id === i.articleId)?.title) ?? [];
};

describe('runEdition', () => {
  test('collects, scores, selects, summarizes and translates a digest', async () => {
    const { editionStore, run, services } = setup();

    const result = await run();

    expect(result.status).toBe('success');
    expect(result.stats).toMatchObject({ scored: 4, selected: 3, replaced: 0, dropped: 0, summarized: 3, translated: 3, aiStopped: null });
    const [digest] = editionStore.digests;
    expect(digest?.digestDate).toBe(localDate(NOW, 'Asia/Ho_Chi_Minh'));
    expect(digest?.items.map((i) => [i.slotId, i.isPinned])).toEqual([[null, true], ['oil', false], ['rest', false]]);
    expect(digestTitles(editionStore)).toEqual([
      'Oil supply shock as tankers attacked', 'Oil traders weigh demand outlook', 'Fed signals rate cut path',
    ]);
    const translated = editionStore.rows().filter((a) => a.status === 'translated');
    expect(translated).toHaveLength(3);
    expect(translated.every((a) => a.contentSnippet?.startsWith('Prices moved sharply'))).toBe(true);
    expect(services.calls.filter((c) => c !== 'jina')).toEqual(['score', 'summary', 'summary', 'translate']);
  });

  test('an unreadable article is replaced as a whole by a readable report of the same story', async () => {
    const services = fakeServices({ unreadable: ['https://blocked.example/1'] });
    const { editionStore, run } = setup(services, [
      { url: 'https://blocked.example/1', title: 'Oil supply shock as tankers attacked', publisher: 'Paywalled', publishedAt: hoursAgo(5) },
      { url: 'https://open.example/1', title: 'Oil supply shock as tankers attacked overnight', publisher: 'Open', publishedAt: hoursAgo(1) },
      ...items.slice(1),
    ]);

    const result = await run();

    expect(result.stats).toMatchObject({ selected: 3, replaced: 1, dropped: 0 });
    const pinned = editionStore.rows().find((a) => a.id === editionStore.digests[0]?.items[0]?.articleId);
    expect(pinned).toMatchObject({ title: 'Oil supply shock as tankers attacked overnight', sourceName: 'Open', url: 'https://open.example/1', impact: 9 });
  });

  test('an unreadable article without substitute is dropped and its slot takes the next candidate', async () => {
    const { editionStore, run } = setup(fakeServices({ unreadable: ['https://news.example/4'] }));

    const result = await run();

    expect(result.stats).toMatchObject({ selected: 3, replaced: 0, dropped: 1 });
    expect(digestTitles(editionStore)).toEqual([
      'Oil supply shock as tankers attacked', 'Fed signals rate cut path', 'Fed official speaks about inflation',
    ]);
  });

  test('a summary with numbers that are not in the article is retried once, then rejected and never published', async () => {
    const services = fakeServices({ inventNumbers: true });
    const { editionStore, run } = setup(services);

    const result = await run();

    expect(result.stats).toMatchObject({ selected: 3, summarized: 0, translated: 0, rejected: 3 });
    expect(services.calls.filter((c) => c === 'summary')).toHaveLength(2 + 3); // 2 batches + 1 retry per article
    expect(services.calls).not.toContain('translate');
    const failed = editionStore.rows().filter((a) => a.status === 'failed');
    expect(failed).toHaveLength(3);
    expect(failed[0]?.error).toBe('unfaithful summary: numbers 42 not in source');
  });

  test('stops at the translation quota, then finishes pending work on the next run', async () => {
    const { editionStore, run } = setup(fakeServices({ translateStatus: 429 }));

    const first = await run();

    expect(first.status).toBe('partial');
    expect(first.stats).toMatchObject({ summarized: 3, translated: 0 });
    expect(first.stats?.aiStopped).toContain('No translate provider available');

    const resumed = new MemoryEditionStore(editionStore['base'], editionConfig, providers);
    resumed.patches = editionStore.patches;
    resumed.digests = editionStore.digests;
    const second = await run(resumed, fakeServices().fetchImpl);

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
