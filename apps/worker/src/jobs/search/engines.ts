import { z } from 'zod';
import { BROWSER_USER_AGENT } from '../../http.ts';
import type { FetchLike } from '../page-reader.ts';
import type { SearchBudget, SearchUsage } from './budget.ts';

// Web search routes for sites the worker cannot read (docs/JOBS_PLAN.md §3.2).
// Only result links are used. The model's own words are never stored: it can list postings that
// are not in the search results.

const TIMEOUT_MS = 60_000;

export interface GeminiSearchResult {
  readonly urls: readonly string[];
  readonly usage: SearchUsage;
}

/** The engine refused for billing or quota reasons (HTTP 402 / 429): stop using it for this run. */
export class SearchRefusedError extends Error {}

const geminiSchema = z.object({
  candidates: z.array(z.object({
    groundingMetadata: z.object({
      webSearchQueries: z.array(z.string()).optional(),
      groundingChunks: z.array(z.object({ web: z.object({ uri: z.string() }).optional() })).optional(),
    }).optional(),
  })).optional(),
  usageMetadata: z.object({
    promptTokenCount: z.number().optional(),
    toolUsePromptTokenCount: z.number().optional(),
    candidatesTokenCount: z.number().optional(),
    thoughtsTokenCount: z.number().optional(),
  }).optional(),
});

/** Grounding links are redirects on a Google host; one hop gives the real page. */
async function resolveRedirect(url: string, fetchImpl: FetchLike): Promise<string> {
  try {
    const response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    return response.headers.get('location') ?? url;
  } catch {
    return url;
  }
}

export async function geminiSearch(
  query: string, apiKey: string, budget: SearchBudget, fetchImpl: FetchLike = fetch,
): Promise<GeminiSearchResult> {
  // The model only searches when it has something to answer, so it is asked for a short list.
  const prompt = `Search Google for current job postings: ${query}\nList up to 10 postings you found, one per line, as: title | company. Nothing else.`;
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(budget.model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: budget.max_output_tokens },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  if (response.status === 402 || response.status === 429) throw new SearchRefusedError(`Gemini search HTTP ${response.status}`);
  if (!response.ok) throw new Error(`Gemini search HTTP ${response.status}`);
  const data = geminiSchema.parse(await response.json());
  const grounding = data.candidates?.[0]?.groundingMetadata;
  const links = [...new Set((grounding?.groundingChunks ?? []).flatMap((chunk) => (chunk.web ? [chunk.web.uri] : [])))];
  const usage = data.usageMetadata ?? {};
  return {
    urls: await Promise.all(links.map((link) => resolveRedirect(link, fetchImpl))),
    usage: {
      searches: grounding?.webSearchQueries?.length ?? 0,
      tokensIn: (usage.promptTokenCount ?? 0) + (usage.toolUsePromptTokenCount ?? 0),
      tokensOut: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
    },
  };
}

/** DuckDuckGo's HTML results page: free, no key, but it blocks after about three queries in a row. */
export async function duckDuckGoSearch(query: string, fetchImpl: FetchLike = fetch): Promise<string[]> {
  const response = await fetchImpl(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': BROWSER_USER_AGENT, 'Accept-Language': 'vi,en;q=0.8' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // 202 is DuckDuckGo's "too many requests" page.
  if (response.status !== 200) throw new SearchRefusedError(`DuckDuckGo HTTP ${response.status}`);
  const html = await response.text();
  const links = [...html.matchAll(/uddg=([^&"]+)/g)].map((match) => decodeURIComponent(match[1] ?? ''));
  return [...new Set(links)].filter((link) => link.startsWith('http') && !link.includes('duckduckgo.com/y.js'));
}
