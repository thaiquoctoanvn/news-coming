import { z } from 'zod';
import type { FoundJob } from '../types.ts';
import { decodeEntities, textOrNull } from './html.ts';

// Career pages of single companies. Google Search does not surface their postings
// (docs/JOBS_PLAN.md §3.2), so each has its own small parser. They list every open role;
// the title filter keeps the Android / mobile ones.

const MAX_DETAIL_CHARS = 4_000;

// ===== VNG: a Next.js page that embeds its job list as JSON; the site's keyword search is ignored server-side. =====

const VNG_ORIGIN = 'https://career.vng.com.vn';
export const VNG_MAX_PAGES = 12;
export const vngListing = (page: number): string => `${VNG_ORIGIN}/tim-kiem-viec-lam?page=${page}`;

const vngSchema = z.object({
  props: z.object({
    pageProps: z.object({
      pages: z.number().int().nonnegative(),
      jobs: z.array(z.object({
        title: z.string(),
        slug: z.string().min(1),
        location: z.string().nullish(),
        description: z.string().nullish(),
      })),
    }),
  }),
});

export function parseVng(html: string): { jobs: FoundJob[]; pages: number } {
  const json = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!json) throw new Error('VNG page has no embedded job data');
  const { pages, jobs } = vngSchema.parse(JSON.parse(json)).props.pageProps;
  return {
    pages,
    jobs: jobs.map((job): FoundJob => ({
      sourceId: 'vng',
      foundVia: null,
      url: `${VNG_ORIGIN}/tim-kiem-viec-lam/chi-tiet/${job.slug}`,
      title: job.title.trim(),
      company: 'VNG',
      location: job.location?.trim() || null,
      salary: null,
      postedAt: null,
      deadline: null,
      // The company's own list of open roles, with the full text: no page read needed.
      detailText: textOrNull(job.description ?? undefined)?.slice(0, MAX_DETAIL_CHARS) ?? null,
    })),
  };
}

// ===== Grab: server-rendered search results for Vietnam. =====

const GRAB_ORIGIN = 'https://www.grab.careers';

export function grabListing(keyword: string): string {
  return `${GRAB_ORIGIN}/en/jobs/?${new URLSearchParams({ search: keyword, country: 'Vietnam' })}`;
}

export function parseGrab(html: string): FoundJob[] {
  const cards = html.split(/(?=<div class="card card-job")/).slice(1);
  return cards.flatMap((card): FoundJob[] => {
    const link = /<a class="stretched-link[^"]*" href="([^"]+)">([\s\S]*?)<\/a>/.exec(card);
    const title = textOrNull(link?.[2]);
    if (!link?.[1] || !title) return [];
    // The first entry of the meta list is the location ("HCMC, Vietnam"), the second the team.
    const location = textOrNull(/<ul class="list-inline job-meta">\s*<li[^>]*>([\s\S]*?)<\/li>/.exec(card)?.[1]);
    return [{
      sourceId: 'grab', foundVia: null, url: new URL(link[1], GRAB_ORIGIN).href, title, company: 'Grab',
      location, salary: null, postedAt: null, deadline: null, detailText: null,
    }];
  });
}

// ===== Cake by VPBank: server-rendered list of all open roles. =====

const CAKE_ORIGIN = 'https://cake.vn';
export const CAKE_LISTING = `${CAKE_ORIGIN}/tuyen-dung/jobs`;

/** Cake writes office codes; only the ones that are clear become a location, the rest stay unknown. */
function cakeLocation(code: string | null): string | null {
  if (!code) return null;
  if (code === 'HN') return 'Hà Nội';
  return /HCM/i.test(code) ? code : null;
}

export function parseCake(html: string): FoundJob[] {
  const items = html.match(/<li class="list-none"><a href="\/tuyen-dung\/jobs\/[^"]+">[\s\S]*?<\/a><\/li>/g) ?? [];
  return items.flatMap((item): FoundJob[] => {
    const href = /<a href="([^"]+)"/.exec(item)?.[1];
    const title = textOrNull(/<h4[^>]*>([\s\S]*?)<\/h4>/.exec(item)?.[1]);
    if (!href || !title) return [];
    // Paragraphs in order: team, office code, summary.
    const paragraphs = Array.from(item.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g), (match) => textOrNull(match[1]));
    return [{
      sourceId: 'cake', foundVia: null, url: new URL(decodeEntities(href), CAKE_ORIGIN).href, title, company: 'Cake by VPBank',
      location: cakeLocation(paragraphs[1] ?? null), salary: null, postedAt: null, deadline: null, detailText: null,
    }];
  });
}
