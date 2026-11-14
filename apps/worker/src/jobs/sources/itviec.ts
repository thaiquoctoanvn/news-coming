import type { FoundJob } from '../types.ts';

// ITviec blocks GitHub Actions (HTTP 403) but Jina Reader can read it, so the listing arrives as markdown.

export const ITVIEC_LISTINGS = [
  'https://itviec.com/it-jobs/android/ho-chi-minh-hcm',
  'https://itviec.com/it-jobs/mobile-apps/ho-chi-minh-hcm',
] as const;

const UNIT_MS = { minute: 60_000, hour: 3_600_000, day: 86_400_000 } as const;
// One card: "Posted 2 days ago", the title link, then logo, work mode and city lines.
const CARD = /Posted (\d+) (minute|hour|day)s? ago\s+### \[([^\]]+)\]\((https:\/\/itviec\.com\/it-jobs\/[^)?\s]+)[^)]*\)([\s\S]*?)(?=Posted \d+ (?:minute|hour|day)s? ago|\n## |$)/g;
const LOGO = /!\[Image \d+: (.+?) (?:Vietnam )?(?:Big|Small) Logo\]/;
const CITY = /^ ?((?:Ho Chi Minh|Ha Noi|Da Nang|Others)(?: - (?:Ho Chi Minh|Ha Noi|Da Nang|Others))*) ?$/m;

export function parseItviec(markdown: string, now: Date): FoundJob[] {
  return Array.from(markdown.matchAll(CARD), (match): FoundJob => {
    const [, amount = '0', unit = 'day', title = '', url = '', rest = ''] = match;
    return {
      sourceId: 'itviec',
      foundVia: null,
      url,
      title: title.trim(),
      company: LOGO.exec(rest)?.[1]?.trim() ?? null,
      location: CITY.exec(rest)?.[1] ?? null,
      // ITviec shows salaries to signed-in users only.
      salary: null,
      postedAt: new Date(now.getTime() - Number(amount) * UNIT_MS[unit as keyof typeof UNIT_MS]),
      deadline: null,
      detailText: null,
    };
  });
}
