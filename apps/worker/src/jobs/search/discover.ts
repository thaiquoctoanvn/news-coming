import { errorMessage, log } from '../../log.ts';
import type { FoundJob, JobStore, SourceStats } from '../types.ts';
import { addSpend, costOf, refusal, type SearchSpend } from './budget.ts';
import { SearchRefusedError, type GeminiSearchResult } from './engines.ts';

// Finds postings on sites that block the worker by searching for them (docs/JOBS_PLAN.md §6.2):
// Gemini with Google Search while the month's budget allows, DuckDuckGo otherwise.
// A search result only proves a link exists; these postings are verified (or not) on their own page.

export const GEMINI_ENGINE = 'gemini_search';
export const DUCKDUCKGO_ENGINE = 'duckduckgo';
const DUCKDUCKGO_MAX_QUERIES = 3;
const DUCKDUCKGO_PAUSE_MS = 8_000;

interface SearchSite {
  readonly sourceId: string;
  readonly site: string;
  /** Matches a posting page (not a listing) and captures the slug that carries the title. */
  readonly posting: RegExp;
}

const SITES: readonly SearchSite[] = [
  { sourceId: 'topcv', site: 'topcv.vn/viec-lam', posting: /^https:\/\/www\.topcv\.vn\/viec-lam\/([^/]+)\/\d+\.html/ },
  { sourceId: 'jobsgo', site: 'jobsgo.vn/viec-lam', posting: /^https:\/\/jobsgo\.vn\/viec-lam\/(.+)-\d+\.html/ },
  { sourceId: 'topdev', site: 'topdev.vn/viec-lam', posting: /^https:\/\/topdev\.vn\/viec-lam\/(.+)-\d+(?:$|[/?#])/ },
];
const PLACE = 'Hồ Chí Minh';

export interface SearchEngines {
  /** Undefined when no paid search key is configured. */
  readonly gemini?: (query: string) => Promise<GeminiSearchResult>;
  readonly duckDuckGo: (query: string) => Promise<string[]>;
  readonly sleep: (ms: number) => Promise<void>;
}

export interface DiscoverOptions {
  readonly store: JobStore;
  readonly engines: SearchEngines;
  readonly enabledSourceIds: ReadonlySet<string>;
  /** The scan's keywords; each one is searched on every site. */
  readonly keywords: readonly string[];
  readonly now: Date;
}

export interface Discovery {
  readonly jobs: FoundJob[];
  readonly sources: Record<string, SourceStats>;
}

/** The posting's title as written in its own URL ("android-developer-kotlin" → "Android developer kotlin"). */
function titleFromSlug(slug: string): string {
  const words = decodeURIComponent(slug).replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function toFoundJob(url: string, engineId: string): FoundJob | null {
  for (const site of SITES) {
    const slug = site.posting.exec(url)?.[1];
    if (slug) {
      return {
        sourceId: site.sourceId, foundVia: engineId, url, title: titleFromSlug(slug), company: null,
        location: null, salary: null, postedAt: null, deadline: null, detailText: null,
      };
    }
  }
  return null;
}

export async function discover(options: DiscoverOptions): Promise<Discovery> {
  const { store, engines, enabledSourceIds, keywords, now } = options;
  const queries = SITES.filter((site) => enabledSourceIds.has(site.sourceId))
    .flatMap((site) => keywords.map((keyword) => `site:${site.site} ${keyword} ${PLACE}`));
  const today = now.toISOString().slice(0, 10);
  const budget = engines.gemini && enabledSourceIds.has(GEMINI_ENGINE) ? await store.loadSearchBudget() : null;
  let spend: SearchSpend | null = budget ? await store.loadSearchSpend(GEMINI_ENGINE, today) : null;
  let geminiStopped: string | null = budget ? null : 'chưa cấu hình';
  let duckDuckGoLeft = enabledSourceIds.has(DUCKDUCKGO_ENGINE) ? DUCKDUCKGO_MAX_QUERIES : 0;
  const found = { [GEMINI_ENGINE]: 0, [DUCKDUCKGO_ENGINE]: 0 };
  const errors: Record<string, string> = {};
  const jobs: FoundJob[] = [];

  for (const query of queries) {
    let urls: readonly string[] | null = null;
    let engineId = GEMINI_ENGINE;
    if (budget && spend && engines.gemini && !geminiStopped) {
      geminiStopped = refusal(budget, spend, today);
      if (!geminiStopped) {
        try {
          const result = await engines.gemini(query);
          const cost = costOf(result.usage, budget, spend.monthSearches);
          await store.recordSearchSpend(GEMINI_ENGINE, today, result.usage, cost);
          spend = addSpend(spend, result.usage, cost);
          urls = result.urls;
        } catch (error: unknown) {
          // Out of prepaid credit or any other failure: stop paying for this run and fall back.
          geminiStopped = errorMessage(error).slice(0, 200);
          errors[GEMINI_ENGINE] = geminiStopped;
          log.warn('gemini search failed', { error: geminiStopped, refused: error instanceof SearchRefusedError });
        }
      }
    }
    if (urls === null && duckDuckGoLeft > 0) {
      engineId = DUCKDUCKGO_ENGINE;
      try {
        if (duckDuckGoLeft < DUCKDUCKGO_MAX_QUERIES) await engines.sleep(DUCKDUCKGO_PAUSE_MS);
        duckDuckGoLeft--;
        urls = await engines.duckDuckGo(query);
      } catch (error: unknown) {
        duckDuckGoLeft = 0;
        errors[DUCKDUCKGO_ENGINE] = errorMessage(error).slice(0, 200);
        log.warn('duckduckgo search failed', { error: errors[DUCKDUCKGO_ENGINE] });
      }
    }
    for (const url of urls ?? []) {
      const job = toFoundJob(url, engineId);
      if (job) {
        jobs.push(job);
        found[engineId as keyof typeof found]++;
      }
    }
  }

  const sources: Record<string, SourceStats> = {};
  if (budget) {
    const note = errors[GEMINI_ENGINE] ?? (geminiStopped && geminiStopped !== 'chưa cấu hình' ? geminiStopped : undefined);
    sources[GEMINI_ENGINE] = { found: found[GEMINI_ENGINE], ...(note ? { error: note } : {}) };
  }
  if (found[DUCKDUCKGO_ENGINE] > 0 || errors[DUCKDUCKGO_ENGINE]) {
    sources[DUCKDUCKGO_ENGINE] = { found: found[DUCKDUCKGO_ENGINE], ...(errors[DUCKDUCKGO_ENGINE] ? { error: errors[DUCKDUCKGO_ENGINE] } : {}) };
  }
  return { jobs, sources };
}
