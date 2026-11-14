import { z } from 'zod';
import type { FoundJob } from '../types.ts';
import { textOrNull } from './html.ts';

// VietnamWorks' own search API: postings come with expiry date and full text, so no page read is needed.

export const VIETNAMWORKS_SEARCH = 'https://ms.vietnamworks.com/job-search/v1.0/search';
export const VIETNAMWORKS_QUERIES = ['android', 'mobile developer'] as const;
const MAX_DETAIL_CHARS = 4_000;

const responseSchema = z.object({
  data: z.array(z.object({
    jobTitle: z.string(),
    jobUrl: z.url(),
    companyName: z.string().nullish(),
    expiredOn: z.string().nullish(),
    isActive: z.boolean().nullish(),
    onlineOn: z.string().nullish(),
    prettySalary: z.string().nullish(),
    jobDescription: z.string().nullish(),
    jobRequirement: z.string().nullish(),
    workingLocations: z.array(z.object({ cityNameVI: z.string().nullish() })).nullish(),
  })),
});

export function vietnamWorksBody(query: string): string {
  return JSON.stringify({ query, hitsPerPage: 50, page: 0 });
}

function toDate(value: string | null | undefined): Date | null {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

export function parseVietnamWorks(json: string, now: Date): FoundJob[] {
  const { data } = responseSchema.parse(JSON.parse(json));
  return data
    .filter((job) => job.isActive !== false && (toDate(job.expiredOn)?.getTime() ?? Infinity) >= now.getTime())
    .map((job): FoundJob => {
      const cities = [...new Set((job.workingLocations ?? []).map((place) => place.cityNameVI).filter(Boolean))];
      const detail = textOrNull(`${job.jobDescription ?? ''} ${job.jobRequirement ?? ''}`);
      return {
        sourceId: 'vietnamworks',
        foundVia: null,
        url: job.jobUrl,
        title: job.jobTitle.trim(),
        company: job.companyName?.trim() || null,
        location: cities.length > 0 ? cities.join(', ') : null,
        salary: job.prettySalary?.trim() || null,
        postedAt: toDate(job.onlineOn),
        // The API gives the expiry in Vietnam time; keep its calendar day.
        deadline: job.expiredOn?.slice(0, 10) ?? null,
        detailText: detail?.slice(0, MAX_DETAIL_CHARS) ?? null,
      };
    });
}
