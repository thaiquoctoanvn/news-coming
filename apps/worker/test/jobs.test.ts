import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { dedupeKey, inLocation, isRecent, matchesKeywords, normalizeUrl, refreshedText, vietnamDate } from '../src/jobs/filter.ts';
import type { PageRead, PageReader } from '../src/jobs/page-reader.ts';
import { runJobs } from '../src/jobs/run.ts';
import { assignTiers, buildScoreRequest } from '../src/jobs/score.ts';
import { parseCareerViet } from '../src/jobs/sources/careerviet.ts';
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
  const none = new Set<string>();

  test('an open page is verified and its text kept for scoring', async () => {
    const result = await checkPosting(job, readerFor({ [job.url]: { status: 'ok', text: OPEN_PAGE, prose: null } }), '2026-11-14', none);
    expect(result).toMatchObject({ verification: 'verified', note: null });
    expect(result.detailText).toContain('Kotlin');
  });

  test('closed markers, missing pages and past deadlines close the job', async () => {
    const expired = { status: 'ok' as const, text: `${OPEN_PAGE} Tin tuyển dụng này đã hết hạn nộp hồ sơ.`, prose: null };
    expect((await checkPosting(job, readerFor({ [job.url]: expired }), '2026-11-14', none)).verification).toBe('closed');
    expect((await checkPosting(job, readerFor({ [job.url]: { status: 'gone', note: 'HTTP 404' } }), '2026-11-14', none)).verification).toBe('closed');
    expect((await checkPosting({ ...job, deadline: '2026-11-13' }, readerFor({}), '2026-11-14', none)).verification).toBe('closed');
  });

  test('a page that cannot be read stays, marked unverified with the reason', async () => {
    expect(await checkPosting(job, readerFor({}), '2026-11-14', none)).toEqual({
      verification: 'unverified', note: 'Không đọc được trang (HTTP 403)', detailText: null,
    });
    expect((await checkPosting(job, readerFor({}), '2026-11-14', new Set(['itviec']))).note).toBe('Trang này chặn truy cập tự động');
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

    const stats = await runJobs({ store, reader, router: scoringRouter(), adapters, trigger: 'manual', now: () => NOW });

    expect(stats).toMatchObject({ found: 2, inserted: 2, unverified: 1, scored: 2 });
    expect(store.jobs.map((job) => [job.title, job.verification, job.tier, job.reportDate])).toEqual([
      ['Android Developer', 'verified', 'top', '2026-11-14'],
      ['Mobile Engineer', 'unverified', 'unverified', '2026-11-14'],
    ]);
    expect(store.runs[0]?.status).toBe('success');
  });

  test('a second run adds nothing; a repost under a new link keeps one job with the new link', async () => {
    const { store, state, adapters, reader } = setup([found({})]);
    await runJobs({ store, reader, router: scoringRouter(), adapters, trigger: 'manual', now: () => NOW });
    state.jobs = [found({ url: 'https://itviec.com/it-jobs/android-dev-acme-9' })];

    const stats = await runJobs({ store, reader, router: scoringRouter(), adapters, trigger: 'manual', now: () => NOW });

    expect(stats.inserted).toBe(0);
    expect(store.jobs).toHaveLength(1);
    expect(store.jobs[0]).toMatchObject({ url: 'https://itviec.com/it-jobs/android-dev-acme-9', isUpdate: false });
    expect(store.jobs[0]?.postedText).toContain('đăng lại nhiều lần');
  });

  test('a reported job whose salary changed is reported again as an update', async () => {
    const { store, state, adapters, reader } = setup([found({ salary: '20-30 triệu' })]);
    await runJobs({ store, reader, router: scoringRouter(), adapters, trigger: 'manual', now: () => NOW });
    state.jobs = [found({ salary: '25-40 triệu' })];
    const nextDay = new Date('2026-11-15T03:00:00Z');

    const stats = await runJobs({ store, reader, router: scoringRouter(), adapters, trigger: 'manual', now: () => nextDay });

    expect(stats.updated).toBe(1);
    expect(store.jobs[0]).toMatchObject({ salary: '25-40 triệu', isUpdate: true, reportDate: '2026-11-15' });
  });

  test('when AI quota runs out the run is partial and unscored jobs wait for the next run', async () => {
    const { store, adapters, reader } = setup([found({})]);
    const noQuota = { complete: async () => { throw new AiUnavailableError('no provider'); } } as unknown as AiRouter;

    await runJobs({ store, reader, router: noQuota, adapters, trigger: 'schedule', now: () => NOW });
    expect(store.runs[0]).toMatchObject({ status: 'partial', error: 'no provider' });
    expect(store.jobs[0]).toMatchObject({ verification: 'verified', reportDate: null });

    await runJobs({ store, reader, router: scoringRouter(), adapters, trigger: 'schedule', now: () => NOW });
    expect(store.jobs[0]).toMatchObject({ score: 8, reportDate: '2026-11-14' });
  });

  test('a failing source does not stop the others', async () => {
    const store = new MemoryJobStore([{ id: 'itviec', kind: 'direct' }, { id: 'linkedin', kind: 'direct' }]);
    const adapters: Record<string, JobAdapter> = {
      itviec: async () => { throw new Error('HTTP 403 for itviec.com'); },
      linkedin: async () => [found({ sourceId: 'linkedin', url: 'https://www.linkedin.com/jobs/view/a-1' })],
    };

    const stats = await runJobs({ store, reader: readerFor({}), router: scoringRouter(), adapters, trigger: 'manual', now: () => NOW });

    expect(stats.sources).toEqual({ itviec: { found: 0, error: 'HTTP 403 for itviec.com' }, linkedin: { found: 1 } });
    expect(store.runs[0]?.status).toBe('partial');
    expect(store.jobs).toHaveLength(1);
  });
});
