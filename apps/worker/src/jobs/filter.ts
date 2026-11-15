import { createHash } from 'node:crypto';
import type { FoundJob, JobProfile } from './types.ts';

// Deterministic scope rules (docs/JOBS_PLAN.md §2). A profile's keywords decide which postings it
// looks for; its text only scores them and never removes a job.

/** Keywords searched in one scan, over all enabled profiles: bounds requests to the sites and paid searches. */
export const MAX_SCAN_KEYWORDS = 6;
const LOCATIONS = /h[ồo] ch[íi] minh|hcm|s[àa]i g[òo]n|saigon|remote|từ xa|tu xa/i;
const MAX_AGE_DAYS = 14;
const DAY_MS = 86_400_000;
const VIETNAM_OFFSET_MS = 7 * 3_600_000;

/** A posting belongs to a keyword when its title contains it, whatever the letter case. */
export function matchesKeywords(title: string, keywords: readonly string[]): boolean {
  const lower = title.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
}

/** The keywords of all profiles, each once, oldest profile first, cut at the scan limit. */
export function scanKeywords(profiles: readonly Pick<JobProfile, 'keywords'>[]): string[] {
  const all = profiles.flatMap((profile) => profile.keywords.map((keyword) => keyword.trim().toLowerCase()));
  return [...new Set(all.filter((keyword) => keyword !== ''))].slice(0, MAX_SCAN_KEYWORDS);
}

/** Unknown location is kept: the posting page decides, and the reader can always check it. */
export function inLocation(location: string | null): boolean {
  return location === null || LOCATIONS.test(location);
}

export function isRecent(postedAt: Date | null, now: Date): boolean {
  return postedAt === null || now.getTime() - postedAt.getTime() <= MAX_AGE_DAYS * DAY_MS;
}

export function inScope(job: FoundJob, now: Date, keywords: readonly string[]): boolean {
  return matchesKeywords(job.title, keywords) && inLocation(job.location) && isRecent(job.postedAt, now);
}

/** Drops tracking parameters so the same posting always has the same address. */
export function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  parsed.search = '';
  parsed.hash = '';
  // Regional LinkedIn hosts (vn., sg.) serve the same posting and do not resolve everywhere.
  if (parsed.hostname.endsWith('.linkedin.com')) parsed.hostname = 'www.linkedin.com';
  return parsed.href.replace(/\/$/, '');
}

export function urlHash(normalizedUrl: string): string {
  return createHash('sha256').update(normalizedUrl).digest('hex');
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

/** "React Native" → "react-native", the form job boards use in their listing addresses. */
export function slug(text: string): string {
  return fold(text).replace(/ /g, '-');
}

/** The same position at the same company is one job, whatever link it is posted under. */
export function dedupeKey(company: string | null, title: string): string | null {
  return company ? `${fold(company)}|${fold(title)}` : null;
}

/** Calendar day in Vietnam (UTC+7, no daylight saving) as YYYY-MM-DD. */
export function vietnamDate(now: Date): string {
  return new Date(now.getTime() + VIETNAM_OFFSET_MS).toISOString().slice(0, 10);
}

/** "Làm mới 07/11": boards show the last bump, not the original posting date. */
export function refreshedText(postedAt: Date | null): string | null {
  if (!postedAt) return null;
  const [, month, day] = vietnamDate(postedAt).split('-');
  return `Làm mới ${day}/${month}`;
}
