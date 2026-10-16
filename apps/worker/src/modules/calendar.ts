import { z } from 'zod';
import type { CalendarEvent } from './types.ts';
import { isoDate, monthNumber, zonedTime } from './time.ts';

// Parsers for official calendars. Vietnamese titles come from a fixed glossary — no AI involved.

const NEW_YORK = 'America/New_York';
const TOKYO = 'Asia/Tokyo';

export const FOMC_URL = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm';
export const BOJ_URL = 'https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm';
export const AUCTIONS_URL = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/upcoming_auctions?sort=-auction_date&page%5Bsize%5D=50';

/** FOMC meetings of `year`; the decision is announced at 2:00 p.m. ET on the last day. */
export function parseFomcCalendar(html: string, year: number): CalendarEvent[] {
  const start = html.indexOf(`${year} FOMC Meetings`);
  if (start === -1) return [];
  const end = html.indexOf('FOMC Meetings', start + 20);
  const panel = html.slice(start, end === -1 ? undefined : end);
  const events: CalendarEvent[] = [];
  for (const [, monthText = '', dateText = ''] of panel.matchAll(
    /fomc-meeting__month[^>]*>\s*<strong>([^<]+)<\/strong>[\s\S]*?fomc-meeting__date[^>]*>([^<]+)</g,
  )) {
    // "October" + "27-28", or across months "Apr/May" + "30-1"; "*" marks meetings with projections.
    const month = monthNumber(monthText.split('/').at(-1) ?? '');
    const day = Number(dateText.replace(/[^\d-]/g, '').split('-').at(-1));
    if (!month || !day) continue;
    events.push({
      kind: 'fomc',
      title: 'FOMC rate decision',
      titleVi: 'FED công bố quyết định lãi suất (FOMC)',
      startsAt: zonedTime(isoDate(year, month, day), '14:00', NEW_YORK),
      importance: 3,
      sourceUrl: FOMC_URL,
    });
  }
  return events;
}

/**
 * Bank of Japan monetary policy meetings ("Oct. 29 (Thurs.), 30 (Fri.)"). The decision comes on the
 * last day around midday Tokyo time; the exact time is not published in advance.
 */
export function parseBojSchedule(html: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const [, yearText = '', section = ''] of html.matchAll(/<h2 id="p(\d{4})">[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/g)) {
    const year = Number(yearText);
    for (const [, row = ''] of section.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const cell = row.match(/<td>([\s\S]*?)<\/td>/)?.[1]?.replace(/<[^>]+>/g, '') ?? '';
      let month: number | undefined;
      let last: { month: number; day: number } | undefined;
      for (const [, monthText, dayText] of cell.matchAll(/(?:([A-Z][a-z]+)\.?\s+)?(\d{1,2})\s*\(/g)) {
        month = monthText ? monthNumber(monthText) : month;
        if (month) last = { month, day: Number(dayText) };
      }
      if (!last) continue;
      events.push({
        kind: 'boj',
        title: 'BOJ policy decision',
        titleVi: 'BOJ công bố quyết định chính sách tiền tệ',
        startsAt: zonedTime(isoDate(year, last.month, last.day), '12:00', TOKYO),
        importance: 3,
        sourceUrl: BOJ_URL,
      });
    }
  }
  return events;
}

/** Economic releases tracked through FRED's release calendar (BLS/BEA pages block automated access). */
export const FRED_RELEASES = [
  { id: 10, kind: 'cpi', title: 'US CPI', titleVi: 'Mỹ công bố chỉ số giá tiêu dùng (CPI)', time: '08:30', importance: 3 },
  { id: 50, kind: 'nfp', title: 'US Employment Situation (NFP)', titleVi: 'Mỹ công bố báo cáo việc làm (NFP)', time: '08:30', importance: 3 },
  { id: 54, kind: 'pce', title: 'US Personal Income and Outlays (PCE)', titleVi: 'Mỹ công bố thu nhập, chi tiêu cá nhân (PCE)', time: '08:30', importance: 3 },
  { id: 46, kind: 'ppi', title: 'US PPI', titleVi: 'Mỹ công bố chỉ số giá sản xuất (PPI)', time: '08:30', importance: 2 },
  { id: 53, kind: 'gdp', title: 'US GDP', titleVi: 'Mỹ công bố GDP', time: '08:30', importance: 2 },
  { id: 192, kind: 'jolts', title: 'US JOLTS job openings', titleVi: 'Mỹ công bố số việc làm trống (JOLTS)', time: '10:00', importance: 2 },
] as const;

export type FredRelease = (typeof FRED_RELEASES)[number];

export function fredReleaseDatesUrl(release: FredRelease, apiKey: string, from: string): string {
  return `https://api.stlouisfed.org/fred/release/dates?release_id=${release.id}&api_key=${apiKey}&file_type=json`
    + `&include_release_dates_with_no_data=true&realtime_start=${from}&sort_order=asc&limit=6`;
}

const fredDatesSchema = z.object({ release_dates: z.array(z.object({ date: z.string() })) });

export function parseFredReleaseDates(json: string, release: FredRelease): CalendarEvent[] {
  return fredDatesSchema.parse(JSON.parse(json)).release_dates.map((d) => ({
    kind: release.kind,
    title: release.title,
    titleVi: release.titleVi,
    startsAt: zonedTime(d.date, release.time, NEW_YORK),
    importance: release.importance,
    sourceUrl: `https://fred.stlouisfed.org/releases/calendar?rid=${release.id}`,
  }));
}

const auctionsSchema = z.object({
  data: z.array(z.object({ security_type: z.string(), security_term: z.string(), auction_date: z.string() })),
});

/** Coupon auctions (2–30 years) from Treasury's upcoming auctions; reopenings like "9-Year 10-Month" count as 10-year. */
export function parseUpcomingAuctions(json: string): CalendarEvent[] {
  return auctionsSchema.parse(JSON.parse(json)).data.flatMap((a) => {
    if (a.security_type !== 'Note' && a.security_type !== 'Bond') return [];
    const term = a.security_term.match(/^(\d+)-Year(?: (\d+)-Month)?/);
    if (!term) return [];
    const years = Number(term[1]) + (term[2] ? 1 : 0);
    if (years < 2) return [];
    return [{
      kind: 'auction',
      title: `US ${years}-Year ${a.security_type} auction`,
      titleVi: `Đấu giá trái phiếu Kho bạc Mỹ kỳ hạn ${years} năm`,
      startsAt: zonedTime(a.auction_date, '13:00', NEW_YORK),
      importance: years === 10 || years === 30 ? 3 : 2,
      sourceUrl: 'https://www.treasurydirect.gov/auctions/upcoming/',
    } satisfies CalendarEvent];
  });
}
