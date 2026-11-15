import type { PageReader } from '../page-reader.ts';
import type { FoundJob } from '../types.ts';
import { careerVietListing, parseCareerViet } from './careerviet.ts';
import { CAKE_LISTING, VNG_MAX_PAGES, grabListing, parseCake, parseGrab, parseVng, vngListing } from './company-pages.ts';
import { itviecListing, parseItviec } from './itviec.ts';
import { linkedInListing, parseLinkedIn } from './linkedin.ts';
import { VIETNAMWORKS_SEARCH, parseVietnamWorks, vietnamWorksBody } from './vietnamworks.ts';

// One adapter per `job_sources.id` of kind "direct". A source without an adapter is skipped.
// Sites with a search read one listing per keyword; the others read everything and leave it to the title filter.

export type JobAdapter = (reader: PageReader, now: Date, keywords: readonly string[]) => Promise<FoundJob[]>;

async function fromEach<T>(inputs: readonly T[], read: (input: T) => Promise<FoundJob[]>): Promise<FoundJob[]> {
  const found: FoundJob[] = [];
  for (const input of inputs) found.push(...await read(input));
  return found;
}

export const JOB_ADAPTERS: Readonly<Record<string, JobAdapter>> = {
  itviec: (reader, now, keywords) => fromEach(keywords, async (keyword) => parseItviec(await reader.jinaMarkdown(itviecListing(keyword)), now)),
  vietnamworks: (reader, now, keywords) => fromEach(keywords, async (query) => parseVietnamWorks(
    await reader.fetchText(VIETNAMWORKS_SEARCH, {
      method: 'POST',
      body: vietnamWorksBody(query),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    }),
    now,
  )),
  linkedin: (reader, _now, keywords) => fromEach(keywords, async (keyword) => parseLinkedIn(await reader.fetchText(linkedInListing(keyword)))),
  vng: async (reader) => {
    // The site ignores keyword search on the server, so every page of open roles is read (about 7).
    const first = parseVng(await reader.fetchText(vngListing(1)));
    const rest: FoundJob[] = [];
    for (let page = 2; page <= Math.min(first.pages, VNG_MAX_PAGES); page++) {
      rest.push(...parseVng(await reader.fetchText(vngListing(page))).jobs);
    }
    return [...first.jobs, ...rest];
  },
  grab: (reader, _now, keywords) => fromEach(keywords, async (keyword) => parseGrab(await reader.fetchText(grabListing(keyword)))),
  cake: async (reader) => parseCake(await reader.fetchText(CAKE_LISTING)),
  careerviet: (reader, now, keywords) => fromEach(keywords, async (keyword) => parseCareerViet(await reader.fetchText(careerVietListing(keyword)), now)),
};
