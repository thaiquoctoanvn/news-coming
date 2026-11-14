import type { FoundJob } from '../types.ts';
import { textOrNull } from './html.ts';

// LinkedIn's public (signed-out) job search fragment: one <li> card per posting from the last 14 days.

const SEARCH = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
const LAST_14_DAYS = 'r1209600';

export function linkedInListing(keywords: string): string {
  const params = new URLSearchParams({ keywords, location: 'Ho Chi Minh City, Vietnam', f_TPR: LAST_14_DAYS, start: '0' });
  return `${SEARCH}?${params}`;
}

export const LINKEDIN_LISTINGS = [linkedInListing('Android'), linkedInListing('Mobile Developer')] as const;

const pick = (card: string, pattern: RegExp): string | null => textOrNull(pattern.exec(card)?.[1]);

export function parseLinkedIn(html: string): FoundJob[] {
  const cards = html.match(/<li>[\s\S]*?<\/li>/g) ?? [];
  return cards.flatMap((card): FoundJob[] => {
    const url = /class="base-card__full-link[^"]*"[^>]*href="([^"]+)"/.exec(card)?.[1];
    const title = pick(card, /<h3 class="base-search-card__title">([\s\S]*?)<\/h3>/);
    if (!url || !title) return [];
    const posted = /<time[^>]*datetime="(\d{4}-\d{2}-\d{2})"/.exec(card)?.[1];
    return [{
      sourceId: 'linkedin',
      foundVia: null,
      url: url.replace(/&amp;/g, '&'),
      title,
      company: pick(card, /<h4 class="base-search-card__subtitle">([\s\S]*?)<\/h4>/),
      location: pick(card, /<span class="job-search-card__location">([\s\S]*?)<\/span>/),
      salary: null,
      postedAt: posted ? new Date(`${posted}T00:00:00+07:00`) : null,
      deadline: null,
      detailText: null,
    }];
  });
}
