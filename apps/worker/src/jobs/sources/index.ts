import type { PageReader } from '../page-reader.ts';
import type { FoundJob } from '../types.ts';
import { CAREERVIET_LISTINGS, parseCareerViet } from './careerviet.ts';
import { CAKE_LISTING, GRAB_LISTINGS, VNG_MAX_PAGES, parseCake, parseGrab, parseVng, vngListing } from './company-pages.ts';
import { ITVIEC_LISTINGS, parseItviec } from './itviec.ts';
import { LINKEDIN_LISTINGS, parseLinkedIn } from './linkedin.ts';
import { VIETNAMWORKS_QUERIES, VIETNAMWORKS_SEARCH, parseVietnamWorks, vietnamWorksBody } from './vietnamworks.ts';

// One adapter per `job_sources.id` of kind "direct". A source without an adapter is skipped.

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
  vng: async (reader) => {
    // The site ignores keyword search on the server, so every page of open roles is read (about 7).
    const first = parseVng(await reader.fetchText(vngListing(1)));
    const rest: FoundJob[] = [];
    for (let page = 2; page <= Math.min(first.pages, VNG_MAX_PAGES); page++) {
      rest.push(...parseVng(await reader.fetchText(vngListing(page))).jobs);
    }
    return [...first.jobs, ...rest];
  },
  grab: (reader) => fromEach(GRAB_LISTINGS, async (url) => parseGrab(await reader.fetchText(url))),
  cake: async (reader) => parseCake(await reader.fetchText(CAKE_LISTING)),
  careerviet: (reader, now) => fromEach(CAREERVIET_LISTINGS, async (url) => parseCareerViet(await reader.fetchText(url), now)),
};
