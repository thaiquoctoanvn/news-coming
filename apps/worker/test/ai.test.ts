import { z } from 'zod';
import { describe, expect, test } from 'vitest';
import {
  type AiProvider, AiRouter, AiUnavailableError, type UsageStore, type UsageTotals, articleTextFromJina, isGoogleNewsUrl, isPaywalled,
  normalizeStoryKey, parseBatchExecuteUrl, scoringSchema, suspiciousTranslationWords, unsupportedNumbers,
} from '../src/shared.ts';
import { parseModelJson } from '../../../supabase/functions/_shared/ai/json.ts';

const provider = (id: string, overrides: Partial<AiProvider> = {}): AiProvider => ({
  id, role: 'extract', provider: 'groq', model: id, priority: 1, dailyRequestLimit: 1000, dailyTokenLimit: 200_000,
  rpmLimit: 30, tpmLimit: 8000, requestOptions: {}, ...overrides,
});

class FakeUsage implements UsageStore {
  recorded: { providerId: string; tokens: number }[] = [];
  private readonly totals: Map<string, UsageTotals>;
  private readonly topicRequests: number;

  constructor(totals = new Map<string, UsageTotals>(), topicRequests = 0) {
    this.totals = totals;
    this.topicRequests = topicRequests;
  }

  async loadProviderUsage(): Promise<Map<string, UsageTotals>> { return this.totals; }
  async loadTopicRequests(): Promise<number> { return this.topicRequests; }
  async recordUsage(providerId: string, _t: string, _d: string, tokensIn: number, tokensOut: number): Promise<void> {
    this.recorded.push({ providerId, tokens: tokensIn + tokensOut });
  }
}

const groqAnswer = (content: string, status = 200): Response =>
  new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 50 } }), { status });

const request = { system: 'sys', user: 'user', maxOutputTokens: 100 };
const schema = z.object({ ok: z.boolean() });

function router(providers: AiProvider[], fetchImpl: (url: string) => Response, usage = new FakeUsage(), extra: Partial<ConstructorParameters<typeof AiRouter>[0]> = {}) {
  const calls: string[] = [];
  const r = new AiRouter({
    providers, usage, keys: { groq: 'k', gemini: 'k' }, topicId: 't', topicDailyCap: 60,
    fetchImpl: async (url, init) => {
      calls.push(JSON.parse(String(init.body)).model ?? url);
      return fetchImpl(url);
    },
    ...extra,
  });
  return { r, calls, usage };
}

describe('AiRouter', () => {
  test('uses the highest priority provider and records usage', async () => {
    const { r, calls, usage } = router([provider('b', { priority: 2 }), provider('a')], () => groqAnswer('{"ok":true}'));

    const result = await r.complete('extract', request, schema);

    expect(result).toEqual({ data: { ok: true }, providerId: 'a' });
    expect(calls).toEqual(['a']);
    expect(usage.recorded).toEqual([{ providerId: 'a', tokens: 150 }]);
  });

  test('falls back on 429 and invalid JSON, and stops using a rate-limited provider', async () => {
    let n = 0;
    const answers = [groqAnswer('rate limited', 429), groqAnswer('not json'), groqAnswer('{"ok":true}'), groqAnswer('{"ok":true}')];
    const { r, calls } = router([provider('a'), provider('b', { priority: 2 }), provider('c', { priority: 3 })], () => answers[n++]!);

    await r.complete('extract', request, schema);
    await r.complete('extract', request, schema);

    expect(calls).toEqual(['a', 'b', 'c', 'b']);
  });

  test('skips providers at 80% of their daily request or token limit', async () => {
    const usage = new FakeUsage(new Map([
      ['a', { requests: 800, tokens: 0 }],
      ['b', { requests: 0, tokens: 159_900 }],
    ]));
    const { r, calls } = router([provider('a'), provider('b', { priority: 2 }), provider('c', { priority: 3 })], () => groqAnswer('{"ok":true}'), usage);

    await r.complete('extract', request, schema);

    expect(calls).toEqual(['c']);
  });

  test('refuses when the topic daily cap is reached or nothing is available', async () => {
    const capped = router([provider('a')], () => groqAnswer('{"ok":true}'), new FakeUsage(new Map(), 60));
    await expect(capped.r.complete('extract', request, schema)).rejects.toThrow(AiUnavailableError);

    const noTranslator = router([provider('a')], () => groqAnswer('{"ok":true}'));
    await expect(noTranslator.r.complete('translate', request, schema)).rejects.toThrow('No translate provider available');
  });

  test('waits for the per-minute token window instead of exceeding TPM', async () => {
    let clock = 0;
    const sleeps: number[] = [];
    const { r } = router([provider('a', { tpmLimit: 300 })], () => groqAnswer('{"ok":true}'), new FakeUsage(), {
      now: () => clock,
      sleep: async (ms) => { sleeps.push(ms); clock += ms; },
    });
    const big = { system: 'x'.repeat(400), user: '', maxOutputTokens: 100 }; // ~200 tokens estimated

    await r.complete('extract', big, schema);
    await r.complete('extract', big, schema);

    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBeGreaterThan(59_000);
  });
});

describe('model output parsing', () => {
  test('accepts fenced JSON and normalizes scoring fields', () => {
    const text = '```json\n{"items":[{"id":1,"category":"oil","entity":"none","impact":"12","direction":"bearish","reason":"x"}]}\n```';

    expect(parseModelJson(text, scoringSchema).items[0]).toEqual({
      id: '1', category: 'oil', entity: null, impact: 10, direction: 'neutral', explains: null, story: null, reason: 'x',
    });
  });

  test('rejects answers without JSON', () => {
    expect(() => parseModelJson('Sorry, I cannot help', scoringSchema)).toThrow('no JSON object');
  });
});

describe('content helpers', () => {
  test('recognizes Google News article links', () => {
    expect(isGoogleNewsUrl('https://news.google.com/rss/articles/CBMiXYZ?oc=5')).toBe(true);
    expect(isGoogleNewsUrl('https://www.reuters.com/markets/x')).toBe(false);
  });

  test('reads the publisher URL from a batchexecute answer', () => {
    const inner = JSON.stringify(['garturlres', 'https://www.cnbc.com/2026/10/15/oil.html', 1]);
    const answer = `)]}'\n\n${JSON.stringify([['wrb.fr', 'Fbv4je', inner, null, null, null, 'generic']])}`;

    expect(parseBatchExecuteUrl(answer)).toBe('https://www.cnbc.com/2026/10/15/oil.html');
    expect(parseBatchExecuteUrl('garbage')).toBeNull();
  });

  test('keeps the prose of a Jina page and drops navigation and site chrome', () => {
    const prose = 'Oil fell on Thursday as traders assessed supply disruptions after attacks on ships near Hormuz. '.repeat(4).trim();
    const page = [
      'Title: Oil falls', '', 'URL Source: https://www.cnbc.com/x', '', 'Markdown Content:',
      '[Skip to main content](https://x)', '', '*   [Markets](https://x/m) [Tech](https://x/t)', '',
      '![photo](https://img)', '', prose, '', `Analysts at [Goldman](https://gs.com) expect volatility to persist. ${prose}`, '',
      '| Price | Change |', '', 'Secure .gov websites use HTTPS and you should always check the lock icon before sharing data.',
    ].join('\n');

    const text = articleTextFromJina(page);

    expect(text?.split('\n\n')).toEqual([prose, `Analysts at Goldman expect volatility to persist. ${prose}`]);
  });

  test('treats untitled or too short Jina pages as unreadable', () => {
    expect(articleTextFromJina('Title: \n\nMarkdown Content:\nPage not found. This page could not be located on our servers.')).toBeNull();
    expect(articleTextFromJina('Title: Short\n\nMarkdown Content:\nOnly one short sentence of text here, too short.')).toBeNull();
  });

  test('knows paywalled publishers', () => {
    expect(isPaywalled('https://www.reuters.com/markets/x')).toBe(true);
    expect(isPaywalled('https://www.cnbc.com/x')).toBe(false);
  });
});

describe('story keys and translation checks', () => {
  test('normalizes story keys', () => {
    expect(normalizeStoryKey(' US CPI — Sep 2026 ')).toBe('us-cpi-sep-2026');
    expect(normalizeStoryKey('')).toBeNull();
  });

  test('flags English fragments glued into the Vietnamese text', () => {
    const english = 'BMNR rose in premarket trading as Ethereum crossed 2,000 dollars';

    expect(suspiciousTranslationWords('BMNR tăng khoảng 2% trongani giao dịch trước giờ mở cửa', english)).toEqual(['trongani']);
    expect(suspiciousTranslationWords('Ethereum vượt 2.000 $, cổ phiếu BMNR tăng', english)).toEqual([]);
  });
});

describe('faithfulness checks', () => {
  test('accepts numbers taken from the source, including reformatted ones', () => {
    const source = 'Strategy bought 250 bitcoin for $21.5 million, bringing holdings to 848,250 BTC on September 14.';

    expect(unsupportedNumbers('Strategy mua 250 BTC với giá 21,5 triệu $, nâng tổng lên 848.250 BTC ngày 14/9.', source)).toEqual([]);
  });

  test('reports numbers the output invented', () => {
    expect(unsupportedNumbers('Gold rose 1.1% to $4,151 on Thursday', 'Gold rose 1.1% on Thursday')).toEqual(['4', '151']);
  });

  test('allows digits for spelled-out numbers, ordinals and months', () => {
    expect(unsupportedNumbers('Lợi nhuận quý 3 tăng gấp 2 lần trong tháng 10', 'Third-quarter profit doubled to two times in October')).toEqual([]);
  });
});
