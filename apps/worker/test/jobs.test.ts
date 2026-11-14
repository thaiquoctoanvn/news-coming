import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { dedupeKey, inLocation, isRecent, matchesKeywords, normalizeUrl, refreshedText, vietnamDate } from '../src/jobs/filter.ts';
import type { PageRead, PageReader } from '../src/jobs/page-reader.ts';
import { runJobs } from '../src/jobs/run.ts';
import { assignTiers, buildScoreRequest } from '../src/jobs/score.ts';
import { type SearchBudget, costOf, refusal } from '../src/jobs/search/budget.ts';
import { type SearchEngines, discover, toFoundJob } from '../src/jobs/search/discover.ts';
import { SearchRefusedError, duckDuckGoSearch, geminiSearch } from '../src/jobs/search/engines.ts';
import { parseCareerViet } from '../src/jobs/sources/careerviet.ts';
import { parseCake, parseGrab, parseVng } from '../src/jobs/sources/company-pages.ts';
import type { JobAdapter } from '../src/jobs/sources/index.ts';
import { parseItviec } from '../src/jobs/sources/itviec.ts';
import { parseLinkedIn } from '../src/jobs/sources/linkedin.ts';
import { parseVietnamWorks } from '../src/jobs/sources/vietnamworks.ts';
import type { FoundJob } from '../src/jobs/types.ts';
import { checkPosting } from '../src/jobs/verify.ts';
import { AiUnavailableError, type AiRouter } from '../src/shared.ts';
import { MemoryJobStore } from './helpers/memory-job-store.ts';

const fixture = (name: string): string => readFileSync(join(import.meta.dirname, 'fixtures', 'jobs', name), 'utf8');
const NOW = new Date('2026-11-14T03:00:00Z');
const NO_SEARCH: SearchEngines = { duckDuckGo: async () => [], sleep: async () => undefined };
const OPEN_PAGE = `Senior Android Engineer. ${'We build payment apps with Kotlin and Jetpack Compose. '.repeat(10)}`;

describe('job source parsers', () => {
  test('ITviec: cards from the Jina markdown listing', () => {
    const jobs = parseItviec(fixture('itviec-list.md'), NOW);

    expect(jobs.map((job) => job.title)).toEqual([
      'Principal Android Native Engineer (Kotlin)',
      'Staff Mobile Engineer (Android/iOS, Fluent in English)',
      'Senior Android Software Engineer (Kotlin, Java)',
      'ADAS Embedded Software Developer (Joining Bonus)',
    ]);
    expect(jobs[0]).toMatchObject({
      sourceId: 'itviec',
      url: 'https://itviec.com/it-jobs/principal-android-native-engineer-kotlin-andpad-vietnam-co-ltd-1920',
      company: 'ANDPAD VietNam Co., Ltd',
      location: 'Ho Chi Minh - Ha Noi',
      salary: null,
    });
    expect(jobs[0]?.postedAt?.toISOString()).toBe('2026-11-12T03:00:00.000Z');
    expect(jobs[2]?.company).toBe('EPOS Vietnam');
  });

  test('VietnamWorks: API postings carry expiry and text, expired ones are dropped', () => {
    const jobs = parseVietnamWorks(fixture('vietnamworks.json'), NOW);
    const android = jobs.find((job) => job.title === 'Android Engineer');

    expect(android).toMatchObject({
      sourceId: 'vietnamworks',
      company: 'ASSA ABLOY Vietnam',
      location: 'Hồ Chí Minh',
      salary: '$ 1,000-1,500 /tháng',
      deadline: '2026-11-29',
    });
    expect(android?.detailText).toBeTruthy();
    expect(android?.detailText).not.toContain('<p>');
    expect(parseVietnamWorks(fixture('vietnamworks.json'), new Date('2026-11-20T00:00:00Z')).map((job) => job.title))
      .not.toContain('Kỹ Sư Phầm Mềm Nhúng');
  });

  test('LinkedIn: guest search cards', () => {
    const jobs = parseLinkedIn(fixture('linkedin-list.html'));

    expect(jobs).toHaveLength(4);
    expect(jobs[0]).toMatchObject({
      sourceId: 'linkedin',
      title: 'Android Software Engineer (Senior)',
      company: 'EPOS',
      location: 'Ho Chi Minh City, Vietnam',
    });
    expect(jobs[0]?.url).toContain('/jobs/view/android-software-engineer-senior-at-epos-4488117755');
    expect(jobs[0]?.postedAt?.toISOString()).toBe('2026-11-05T17:00:00.000Z');
  });

  test('CareerViet: listing items with salary, update date and days left', () => {
    const jobs = parseCareerViet(fixture('careerviet-list.html'), NOW);
    const last = jobs.at(-1);

    expect(jobs).toHaveLength(3);
    expect(last).toMatchObject({
      sourceId: 'careerviet',
      url: 'https://careerviet.vn/vi/tim-viec-lam/software-development-saleforce.35C8B374.html',
      title: 'Software Development - Saleforce',
      company: 'FE CREDIT',
      location: 'Hồ Chí Minh',
      salary: '1.000 - 1.500 USD',
      deadline: '2026-11-18',
    });
    expect(last?.postedAt?.toISOString()).toBe('2026-10-18T17:00:00.000Z');
  });
});

describe('company career pages', () => {
  test('VNG: open roles embedded in the page, with their text and the page count', () => {
    const { jobs, pages } = parseVng(fixture('vng.html'));

    expect(pages).toBe(7);
    expect(jobs.map((job) => job.title)).toEqual(['Technical Product Manager, Business Operations', 'Data Engineer, VNGGames']);
    expect(jobs[1]).toMatchObject({
      sourceId: 'vng', company: 'VNG', location: 'Thành phố Hồ Chí Minh',
      url: 'https://career.vng.com.vn/tim-kiem-viec-lam/chi-tiet/6943-data-engineer-vnggames-vi',
    });
    expect(jobs[1]?.detailText).toBeTruthy();
    expect(() => parseVng('<html></html>')).toThrow('no embedded job data');
  });

  test('Grab: search result cards with location', () => {
    const jobs = parseGrab(fixture('grab.html'));

    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      sourceId: 'grab', company: 'Grab', title: 'Senior Software Engineer, Mobile (Android)', location: 'HCMC, Vietnam',
      url: 'https://www.grab.careers/en/jobs/744000127795765/senior-software-engineer-mobile-android/',
    });
    expect(inLocation(jobs[0]?.location ?? null)).toBe(true);
  });

  test('Cake: roles with office codes; unclear codes stay unknown', () => {
    const jobs = parseCake(fixture('cake.html'));

    expect(jobs.map((job) => [job.title, job.location])).toEqual([
      ['CV/CVC Thu Hồi Nợ Qua Điện Thoại', 'Hà Nội'],
      ['Backend Engineer (Senior/Staff/Principal role)', null],
    ]);
    expect(jobs[1]?.url).toBe('https://cake.vn/tuyen-dung/jobs/Backend-Engineer');
  });
});

describe('job scope and identity', () => {
  test('keeps android or mobile titles in Ho Chi Minh or remote, from the last 14 days', () => {
    expect(matchesKeywords('Senior ANDROID Engineer')).toBe(true);
    expect(matchesKeywords('Mobile Developer (Flutter)')).toBe(true);
    expect(matchesKeywords('Backend Developer')).toBe(false);
    expect(inLocation('Hồ Chí Minh')).toBe(true);
    expect(inLocation('Ho Chi Minh City, Vietnam')).toBe(true);
    expect(inLocation('Remote')).toBe(true);
    expect(inLocation('Hà Nội')).toBe(false);
    expect(inLocation(null)).toBe(true);
    expect(isRecent(new Date('2026-11-01T00:00:00Z'), NOW)).toBe(true);
    expect(isRecent(new Date('2026-10-20T00:00:00Z'), NOW)).toBe(false);
    expect(isRecent(null, NOW)).toBe(true);
  });

  test('same posting or position gets the same identity', () => {
    expect(normalizeUrl('https://vn.linkedin.com/jobs/view/android-at-epos-1?position=1&refId=x#top'))
      .toBe('https://www.linkedin.com/jobs/view/android-at-epos-1');
    expect(dedupeKey('Công ty EPOS Việt Nam', 'Android Developer (Kotlin)')).toBe(dedupeKey('cong ty epos viet nam', 'android developer  kotlin'));
    expect(dedupeKey(null, 'Android Developer')).toBeNull();
    expect(vietnamDate(new Date('2026-11-14T18:30:00Z'))).toBe('2026-11-15');
    expect(refreshedText(new Date('2026-11-07T03:00:00Z'))).toBe('Làm mới 07/11');
  });
});

function readerFor(pages: Record<string, PageRead>): PageReader {
  return {
    fetchText: async () => '',
    jinaMarkdown: async () => '',
    readPosting: async (url) => pages[url] ?? { status: 'blocked', note: 'HTTP 403' },
  };
}

describe('checkPosting', () => {
  const job = { id: '1', sourceId: 'itviec', url: 'https://itviec.com/it-jobs/a-1', deadline: null };

  test('an open page is verified and its text kept for scoring', async () => {
    const result = await checkPosting(job, readerFor({ [job.url]: { status: 'ok', text: OPEN_PAGE, prose: null } }), '2026-11-14');
    expect(result).toMatchObject({ verification: 'verified', note: null });
    expect(result.detailText).toContain('Kotlin');
  });

  test('closed markers, missing pages and past deadlines close the job', async () => {
    const expired = { status: 'ok' as const, text: `${OPEN_PAGE} Tin tuyển dụng này đã hết hạn nộp hồ sơ.`, prose: null };
    expect((await checkPosting(job, readerFor({ [job.url]: expired }), '2026-11-14')).verification).toBe('closed');
    expect((await checkPosting(job, readerFor({ [job.url]: { status: 'gone', note: 'HTTP 404' } }), '2026-11-14')).verification).toBe('closed');
    expect((await checkPosting({ ...job, deadline: '2026-11-13' }, readerFor({}), '2026-11-14')).verification).toBe('closed');
  });

  test('a page that cannot be read stays, marked unverified with the reason', async () => {
    expect(await checkPosting(job, readerFor({}), '2026-11-14')).toEqual({
      verification: 'unverified', note: 'Không đọc được trang (HTTP 403)', detailText: null,
    });
  });
});

describe('scoring', () => {
  test('the profile is sent with each posting, and never decides what is kept', () => {
    const request = buildScoreRequest('Kotlin, 5 năm', [
      { id: 'a', title: 'Android Dev', company: null, location: null, salary: null, detailText: null },
    ]);
    expect(request.user).toContain('Kotlin, 5 năm');
    expect(request.user).toContain('### j1');
    expect(request.user).toContain('Posting text: (none)');
  });

  test('tiers: three best verified on top, unverified apart whatever the score', () => {
    const tiers = assignTiers([
      { id: 'a', score: 9, verification: 'verified' },
      { id: 'b', score: 8, verification: 'verified' },
      { id: 'c', score: 8, verification: 'verified' },
      { id: 'd', score: 7, verification: 'verified' },
      { id: 'e', score: 5, verification: 'verified' },
      { id: 'f', score: 3, verification: 'verified' },
      { id: 'g', score: 10, verification: 'unverified' },
    ]);
    expect(Object.fromEntries(tiers.map((tier) => [tier.id, tier.tier]))).toEqual({
      a: 'top', b: 'top', c: 'top', d: 'fit', e: 'maybe', f: 'low', g: 'unverified',
    });
  });
});

describe('runJobs', () => {
  const found = (overrides: Partial<FoundJob>): FoundJob => ({
    sourceId: 'itviec', foundVia: null, url: 'https://itviec.com/it-jobs/android-dev-acme-1', title: 'Android Developer',
    company: 'Acme', location: 'Ho Chi Minh', salary: null, postedAt: NOW, deadline: null, detailText: null, ...overrides,
  });
  const scoringRouter = (score = 8): AiRouter => ({
    complete: async (_role: string, request: { user: string }) => ({
      providerId: 'test',
      data: { jobs: [...request.user.matchAll(/### (j\d+)/g)].map((match) => ({ id: match[1], score, reason: 'Hợp Kotlin.', tip: 'Nhấn mạnh Compose.' })) },
    }),
  }) as unknown as AiRouter;
  const setup = (jobs: FoundJob[]) => {
    const store = new MemoryJobStore([{ id: 'itviec', kind: 'direct' }]);
    const state = { jobs };
    const adapters: Record<string, JobAdapter> = { itviec: async () => state.jobs };
    const pages: Record<string, PageRead> = { 'https://itviec.com/it-jobs/android-dev-acme-1': { status: 'ok', text: OPEN_PAGE, prose: null } };
    return { store, state, adapters, reader: readerFor(pages), pages };
  };

  test('new postings in scope are verified, scored and reported today; out-of-scope ones are dropped', async () => {
    const { store, adapters, reader } = setup([
      found({}),
      found({ url: 'https://itviec.com/it-jobs/blocked-2', title: 'Mobile Engineer', company: 'Beta' }),
      found({ url: 'https://itviec.com/it-jobs/backend-3', title: 'Backend Developer', company: 'Gamma' }),
    ]);

    const stats = await runJobs({ store, reader, router: scoringRouter(), adapters, engines: NO_SEARCH, trigger: 'manual', now: () => NOW });

    expect(stats).toMatchObject({ found: 2, inserted: 2, unverified: 1, scored: 2 });
    expect(store.jobs.map((job) => [job.title, job.verification, job.tier, job.reportDate])).toEqual([
      ['Android Developer', 'verified', 'top', '2026-11-14'],
      ['Mobile Engineer', 'unverified', 'unverified', '2026-11-14'],
    ]);
    expect(store.runs[0]?.status).toBe('success');
  });

  test('a second run adds nothing; a repost under a new link keeps one job with the new link', async () => {
    const { store, state, adapters, reader } = setup([found({})]);
    await runJobs({ store, reader, router: scoringRouter(), adapters, engines: NO_SEARCH, trigger: 'manual', now: () => NOW });
    state.jobs = [found({ url: 'https://itviec.com/it-jobs/android-dev-acme-9' })];

    const stats = await runJobs({ store, reader, router: scoringRouter(), adapters, engines: NO_SEARCH, trigger: 'manual', now: () => NOW });

    expect(stats.inserted).toBe(0);
    expect(store.jobs).toHaveLength(1);
    expect(store.jobs[0]).toMatchObject({ url: 'https://itviec.com/it-jobs/android-dev-acme-9', isUpdate: false });
    expect(store.jobs[0]?.postedText).toContain('đăng lại nhiều lần');
  });

  test('a reported job whose salary changed is reported again as an update', async () => {
    const { store, state, adapters, reader } = setup([found({ salary: '20-30 triệu' })]);
    await runJobs({ store, reader, router: scoringRouter(), adapters, engines: NO_SEARCH, trigger: 'manual', now: () => NOW });
    state.jobs = [found({ salary: '25-40 triệu' })];
    const nextDay = new Date('2026-11-15T03:00:00Z');

    const stats = await runJobs({ store, reader, router: scoringRouter(), adapters, engines: NO_SEARCH, trigger: 'manual', now: () => nextDay });

    expect(stats.updated).toBe(1);
    expect(store.jobs[0]).toMatchObject({ salary: '25-40 triệu', isUpdate: true, reportDate: '2026-11-15' });
  });

  test('a job still listed two weeks after it was shown is shown again as an update, with its score kept', async () => {
    const { store, adapters, reader } = setup([found({})]);
    const run = (now: Date) => runJobs({ store, reader, router: scoringRouter(), adapters, engines: NO_SEARCH, trigger: 'manual', now: () => now });
    await run(NOW);

    const soon = await run(new Date('2026-11-27T03:00:00Z'));
    expect(soon.updated).toBe(0);
    expect(store.jobs[0]).toMatchObject({ reportDate: '2026-11-14', isUpdate: false });

    const later = await run(new Date('2026-11-28T03:00:00Z'));
    expect(later).toMatchObject({ updated: 1, inserted: 0, scored: 0 });
    expect(store.jobs[0]).toMatchObject({ reportDate: '2026-11-28', isUpdate: true, score: 8, tier: 'top' });
  });

  test('when AI quota runs out the run is partial and unscored jobs wait for the next run', async () => {
    const { store, adapters, reader } = setup([found({})]);
    const noQuota = { complete: async () => { throw new AiUnavailableError('no provider'); } } as unknown as AiRouter;

    await runJobs({ store, reader, router: noQuota, adapters, engines: NO_SEARCH, trigger: 'schedule', now: () => NOW });
    expect(store.runs[0]).toMatchObject({ status: 'partial', error: 'no provider' });
    expect(store.jobs[0]).toMatchObject({ verification: 'verified', reportDate: null });

    await runJobs({ store, reader, router: scoringRouter(), adapters, engines: NO_SEARCH, trigger: 'schedule', now: () => NOW });
    expect(store.jobs[0]).toMatchObject({ score: 8, reportDate: '2026-11-14' });
  });

  test('a failing source does not stop the others', async () => {
    const store = new MemoryJobStore([{ id: 'itviec', kind: 'direct' }, { id: 'linkedin', kind: 'direct' }]);
    const adapters: Record<string, JobAdapter> = {
      itviec: async () => { throw new Error('HTTP 403 for itviec.com'); },
      linkedin: async () => [found({ sourceId: 'linkedin', url: 'https://www.linkedin.com/jobs/view/a-1' })],
    };

    const stats = await runJobs({ store, reader: readerFor({}), router: scoringRouter(), adapters, engines: NO_SEARCH, trigger: 'manual', now: () => NOW });

    expect(stats.sources).toEqual({ itviec: { found: 0, error: 'HTTP 403 for itviec.com' }, linkedin: { found: 1 } });
    expect(store.runs[0]?.status).toBe('partial');
    expect(store.jobs).toHaveLength(1);
  });
});

describe('paid search budget', () => {
  const budget: SearchBudget = {
    model: 'gemini-3.5-flash-lite', max_output_tokens: 400, monthly_stop_usd: 0.8, monthly_search_cap: 4000,
    free_searches_per_month: 5000, usd_per_1k_searches: 14, usd_per_mtok_in: 0.3, usd_per_mtok_out: 2.5,
  };
  const spent = (monthCostUsd: number, todayCostUsd = 0, monthSearches = 0) => ({ monthCostUsd, todayCostUsd, monthSearches });

  test('a call costs its tokens; searches cost only beyond the free monthly allowance', () => {
    expect(costOf({ searches: 2, tokensIn: 47, tokensOut: 236 }, budget, 0)).toBeCloseTo(0.0006041, 7);
    expect(costOf({ searches: 2, tokensIn: 0, tokensOut: 0 }, budget, 4999)).toBeCloseTo(0.014, 6);
  });

  test('stops at the monthly amount, the monthly search count and the day\'s share', () => {
    expect(refusal(budget, spent(0), '2026-11-15')).toBeNull();
    expect(refusal(budget, spent(0.8), '2026-11-15')).toBe('đã chạm ngân sách tìm kiếm của tháng');
    expect(refusal(budget, spent(0.1, 0, 4000), '2026-11-15')).toBe('đã chạm số lượt tìm của tháng');
    // 0.8 USD over 16 remaining days = 0.05 USD a day.
    expect(refusal(budget, spent(0.05, 0.05), '2026-11-15')).toBe('đã chạm ngân sách tìm kiếm của hôm nay');
    expect(refusal(budget, spent(0.04, 0.04), '2026-11-15')).toBeNull();
  });

  const enabled = new Set(['topcv', 'jobsgo', 'gemini_search', 'duckduckgo']);
  const TOPCV = 'https://www.topcv.vn/viec-lam/android-developer-kotlin/2318679.html';

  test('only posting pages become jobs, titled from their own URL', () => {
    expect(toFoundJob(TOPCV, 'gemini_search')).toMatchObject({
      sourceId: 'topcv', foundVia: 'gemini_search', title: 'Android developer kotlin', company: null, postedAt: null,
    });
    expect(toFoundJob('https://www.topcv.vn/tim-viec-lam-android', 'gemini_search')).toBeNull();
    expect(toFoundJob('https://vn.indeed.com/q-android-jobs.html', 'duckduckgo')).toBeNull();
  });

  test('within budget every query goes to Gemini and its real cost is recorded', async () => {
    const store = new MemoryJobStore([]);
    store.budget = budget;
    const queries: string[] = [];
    const engines: SearchEngines = {
      ...NO_SEARCH,
      gemini: async (query) => {
        queries.push(query);
        return { urls: [TOPCV], usage: { searches: 2, tokensIn: 40, tokensOut: 200 } };
      },
    };

    const result = await discover({ store, engines, enabledSourceIds: enabled, now: NOW });

    expect(queries).toHaveLength(4);
    expect(queries[0]).toBe('site:topcv.vn/viec-lam android developer Hồ Chí Minh');
    expect(store.spendRecords).toHaveLength(4);
    expect(store.spendRecords[0]).toMatchObject({ engineId: 'gemini_search', today: '2026-11-14', usage: { searches: 2 } });
    expect(result.sources).toEqual({ gemini_search: { found: 4 } });
  });

  test('when the budget is used up, or Gemini refuses, DuckDuckGo serves at most three queries', async () => {
    const store = new MemoryJobStore([]);
    store.budget = budget;
    store.spend = spent(0.8);
    let paidCalls = 0;
    let freeCalls = 0;
    const engines: SearchEngines = {
      gemini: async () => { paidCalls++; return { urls: [], usage: { searches: 0, tokensIn: 0, tokensOut: 0 } }; },
      duckDuckGo: async () => { freeCalls++; return [TOPCV]; },
      sleep: async () => undefined,
    };

    const exhausted = await discover({ store, engines, enabledSourceIds: enabled, now: NOW });
    expect([paidCalls, freeCalls]).toEqual([0, 3]);
    expect(exhausted.sources).toEqual({
      gemini_search: { found: 0, error: 'đã chạm ngân sách tìm kiếm của tháng' },
      duckduckgo: { found: 3 },
    });

    store.spend = spent(0);
    freeCalls = 0;
    const refusing: SearchEngines = { ...engines, gemini: async () => { paidCalls++; throw new SearchRefusedError('Gemini search HTTP 402'); } };
    const refused = await discover({ store, engines: refusing, enabledSourceIds: enabled, now: NOW });
    expect([paidCalls, freeCalls]).toEqual([1, 3]);
    expect(refused.sources.gemini_search).toEqual({ found: 0, error: 'Gemini search HTTP 402' });
    expect(store.spendRecords).toHaveLength(0);
  });

  test('without a key or budget settings only the free route runs', async () => {
    const store = new MemoryJobStore([]);
    let freeCalls = 0;
    const result = await discover({
      store, engines: { ...NO_SEARCH, duckDuckGo: async () => { freeCalls++; return []; } }, enabledSourceIds: enabled, now: NOW,
    });
    expect(freeCalls).toBe(3);
    expect(result.sources).toEqual({});
  });
});

describe('search engines', () => {
  const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });
  const budget: SearchBudget = {
    model: 'gemini-3.5-flash-lite', max_output_tokens: 400, monthly_stop_usd: 0.8, monthly_search_cap: 4000,
    free_searches_per_month: 5000, usd_per_1k_searches: 14, usd_per_mtok_in: 0.3, usd_per_mtok_out: 2.5,
  };

  test('Gemini: links come from the search results only, redirects are resolved, usage is counted', async () => {
    const bodies: string[] = [];
    const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
      if (url.includes('generativelanguage')) {
        bodies.push(String(init?.body));
        return json({
          candidates: [{
            content: { parts: [{ text: 'Fake Job | https://invented.example/job' }] },
            groundingMetadata: {
              webSearchQueries: ['a', 'b'],
              groundingChunks: [{ web: { uri: 'https://redirect.example/1', title: 'topcv.vn' } }, { web: { uri: 'https://redirect.example/1' } }],
            },
          }],
          usageMetadata: { promptTokenCount: 47, candidatesTokenCount: 236, thoughtsTokenCount: 10 },
        });
      }
      return new Response(null, { status: 302, headers: { location: 'https://www.topcv.vn/viec-lam/android-dev/1.html' } });
    };

    const result = await geminiSearch('site:topcv.vn android', 'key-1234567890', budget, fetchImpl);

    expect(result.urls).toEqual(['https://www.topcv.vn/viec-lam/android-dev/1.html']);
    expect(result.usage).toEqual({ searches: 2, tokensIn: 47, tokensOut: 246 });
    expect(JSON.parse(bodies[0] ?? '{}')).toMatchObject({ tools: [{ google_search: {} }], generationConfig: { maxOutputTokens: 400 } });
  });

  test('Gemini: no credit or quota is a refusal', async () => {
    await expect(geminiSearch('q', 'key-1234567890', budget, async () => json({ error: {} }, 402))).rejects.toBeInstanceOf(SearchRefusedError);
  });

  test('DuckDuckGo: result links without ads; its rate-limit page is a refusal', async () => {
    const html = '<a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.topcv.vn%2Fviec-lam%2Fa%2F1.html&amp;rut=x">A</a>'
      + '<a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fduckduckgo.com%2Fy.js%3Fad_domain%3Dx&amp;rut=y">Ad</a>';
    expect(await duckDuckGoSearch('q', async () => new Response(html))).toEqual(['https://www.topcv.vn/viec-lam/a/1.html']);
    await expect(duckDuckGoSearch('q', async () => new Response('', { status: 202 }))).rejects.toBeInstanceOf(SearchRefusedError);
  });
});
