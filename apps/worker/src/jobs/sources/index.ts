import type { PageReader } from '../page-reader.ts';
import type { FoundJob } from '../types.ts';
import { CAREERVIET_LISTINGS, parseCareerViet } from './careerviet.ts';
import { ITVIEC_LISTINGS, parseItviec } from './itviec.ts';
import { LINKEDIN_LISTINGS, parseLinkedIn } from './linkedin.ts';
import { VIETNAMWORKS_QUERIES, VIETNAMWORKS_SEARCH, parseVietnamWorks, vietnamWorksBody } from './vietnamworks.ts';

// One adapter per `job_sources.id` of kind "direct". A source without an adapter is skipped
// (VNG, Grab and Cake are seeded but not written yet — docs/JOBS_PLAN.md §9).

export type JobAdapter = (reader: PageReader, now: Date) => Promise<FoundJob[]>;

async function fromEach<T>(inputs: readonly T[], read: (input: T) => Promise<FoundJob[]>): Promise<FoundJob[]> {
  const found: FoundJob[] = [];
  for (const input of inputs) found.push(...await read(input));
  return found;
}

export const JOB_ADAPTERS: Readonly<Record<string, JobAdapter>> = {
  itviec: (reader, now) => fromEach(ITVIEC_LISTINGS, async (url) => parseItviec(await reader.jinaMarkdown(url), now)),
  vietnamworks: (reader, now) => fromEach(VIETNAMWORKS_QUERIES, async (query) => parseVietnamWorks(
    await reader.fetchText(VIETNAMWORKS_SEARCH, {
      method: 'POST',
      body: vietnamWorksBody(query),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    }),
    now,
  )),
  linkedin: (reader) => fromEach(LINKEDIN_LISTINGS, async (url) => parseLinkedIn(await reader.fetchText(url))),
  careerviet: (reader, now) => fromEach(CAREERVIET_LISTINGS, async (url) => parseCareerViet(await reader.fetchText(url), now)),
};
