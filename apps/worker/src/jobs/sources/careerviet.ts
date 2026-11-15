import { slug } from '../filter.ts';
import type { FoundJob } from '../types.ts';
import { decodeEntities, textOrNull } from './html.ts';

// CareerViet search pages, already limited to Ho Chi Minh by the URL. The keyword search is loose
// (it also returns unrelated IT jobs); the title filter removes those.

const ORIGIN = 'https://careerviet.vn';

export function careerVietListing(keyword: string): string {
  return `${ORIGIN}/viec-lam/${slug(keyword)}-tai-ho-chi-minh-kl8-vi.html`;
}

const DAY_MS = 86_400_000;

/** "19-10-2026" (Vietnam date) → Date. */
function parseDate(text: string | undefined): Date | null {
  const match = text ? /(\d{2})-(\d{2})-(\d{4})/.exec(text) : null;
  return match ? new Date(`${match[3]}-${match[2]}-${match[1]}T00:00:00+07:00`) : null;
}

export function parseCareerViet(html: string, now: Date): FoundJob[] {
  const items = html.split(/(?=<div class="job-item" id="job-item-)/).slice(1);
  return items.flatMap((item): FoundJob[] => {
    const link = /class="job_link"[^>]*title="([^"]*)"[^>]*href="([^"]+)"/.exec(item);
    if (!link?.[1] || !link[2]) return [];
    const daysLeft = /chỉ còn[\s\S]{0,40}?<time>(\d+)/.exec(item)?.[1];
    return [{
      sourceId: 'careerviet',
      foundVia: null,
      url: new URL(link[2], ORIGIN).href,
      title: decodeEntities(link[1]).trim(),
      company: textOrNull(/class="company-name"[^>]*title="([^"]*)"/.exec(item)?.[1]),
      location: textOrNull(/class="location" title="([^"]*)"/.exec(item)?.[1]),
      salary: textOrNull(/<div class="salary">([\s\S]*?)<\/div>/.exec(item)?.[1])?.replace(/^Lương:\s*/, '') ?? null,
      postedAt: parseDate(/Cập nhật[\s\S]{0,40}?<time>([^<]+)<\/time>/.exec(item)?.[1]),
      deadline: daysLeft ? new Date(now.getTime() + 7 * 3_600_000 + Number(daysLeft) * DAY_MS).toISOString().slice(0, 10) : null,
      detailText: null,
    }];
  });
}
