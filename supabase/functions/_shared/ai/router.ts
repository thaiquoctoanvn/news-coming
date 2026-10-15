import type { z } from 'zod';
import { parseModelJson } from './json.ts';
import {
  type AiProvider, type AiRole, type ApiKeys, type ChatRequest, type FetchLike,
  RateLimitedError, callProvider, hasKey,
} from './providers.ts';

// Picks the first provider (by priority) that still has free quota, waits for its per-minute
// window, and falls back to the next provider on rate limits or errors. Never exceeds 80% of a
// daily free limit (.agents/rules/cost.md) and never exceeds the topic's daily request cap.

export const QUOTA_SAFETY_RATIO = 0.8;
const WINDOW_MS = 60_000;
const MAX_WAIT_MS = 70_000;
const CHARS_PER_TOKEN = 4;

export interface UsageTotals {
  readonly requests: number;
  readonly tokens: number;
}

export interface UsageStore {
  /** Usage today (UTC) per provider id, summed over all topics. */
  loadProviderUsage(date: string): Promise<Map<string, UsageTotals>>;
  loadTopicRequests(topicId: string, date: string): Promise<number>;
  recordUsage(providerId: string, topicId: string, date: string, tokensIn: number, tokensOut: number): Promise<void>;
}

export interface RouterOptions {
  readonly providers: readonly AiProvider[];
  readonly keys: ApiKeys;
  readonly usage: UsageStore;
  readonly topicId: string;
  readonly topicDailyCap: number;
  readonly fetchImpl?: FetchLike;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly onEvent?: (message: string, fields: Record<string, unknown>) => void;
}

/** No provider could serve the request today; callers should stop and leave work for the next run. */
export class AiUnavailableError extends Error {}

interface WindowEntry {
  readonly at: number;
  readonly tokens: number;
}

export class AiRouter {
  private readonly options: RouterOptions;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly windows = new Map<string, WindowEntry[]>();
  private readonly exhausted = new Set<string>();
  private usage: Map<string, UsageTotals> | null = null;
  private topicRequests = 0;

  constructor(options: RouterOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async complete<T>(role: AiRole, request: ChatRequest, schema: z.ZodType<T>): Promise<{ data: T; providerId: string }> {
    await this.loadUsage();
    if (this.topicRequests >= this.options.topicDailyCap) {
      throw new AiUnavailableError(`Topic ${this.options.topicId} reached its daily cap of ${this.options.topicDailyCap} AI requests`);
    }
    const estimate = estimateTokens(request);
    const errors: string[] = [];

    for (const provider of this.candidates(role)) {
      if (!this.hasQuota(provider, estimate)) continue;
      if (!(await this.waitForWindow(provider, estimate))) continue;
      try {
        const response = await callProvider(provider, request, this.options.keys, this.options.fetchImpl);
        this.settleWindow(provider.id, estimate, response.tokensIn + response.tokensOut);
        await this.record(provider, response.tokensIn, response.tokensOut);
        return { data: parseModelJson(response.text, schema), providerId: provider.id };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${provider.id}: ${message}`);
        if (error instanceof RateLimitedError) this.exhausted.add(provider.id);
        this.options.onEvent?.('ai provider failed', { provider: provider.id, error: message.slice(0, 300) });
      }
    }
    throw new AiUnavailableError(`No ${role} provider available. ${errors.join(' | ')}`.trim());
  }

  private candidates(role: AiRole): AiProvider[] {
    return this.options.providers
      .filter((p) => p.role === role && !this.exhausted.has(p.id) && hasKey(p, this.options.keys))
      .sort((a, b) => a.priority - b.priority);
  }

  private hasQuota(provider: AiProvider, estimate: number): boolean {
    const used = this.usage?.get(provider.id) ?? { requests: 0, tokens: 0 };
    if (used.requests + 1 > provider.dailyRequestLimit * QUOTA_SAFETY_RATIO) return false;
    if (provider.dailyTokenLimit !== null && used.tokens + estimate > provider.dailyTokenLimit * QUOTA_SAFETY_RATIO) return false;
    return provider.tpmLimit === null || estimate <= provider.tpmLimit;
  }

  /** Waits until the provider's last-minute request and token counts leave room; false if that takes too long. */
  private async waitForWindow(provider: AiProvider, estimate: number): Promise<boolean> {
    const deadline = this.now() + MAX_WAIT_MS;
    for (;;) {
      const now = this.now();
      const entries = (this.windows.get(provider.id) ?? []).filter((e) => now - e.at < WINDOW_MS);
      this.windows.set(provider.id, entries);
      const tokens = entries.reduce((sum, e) => sum + e.tokens, 0);
      const fitsTokens = provider.tpmLimit === null || tokens + estimate <= provider.tpmLimit;
      if (entries.length < provider.rpmLimit && fitsTokens) {
        this.windows.set(provider.id, [...entries, { at: now, tokens: estimate }]);
        return true;
      }
      const oldest = entries[0];
      const waitMs = oldest ? oldest.at + WINDOW_MS - now + 100 : 1_000;
      if (now + waitMs > deadline) return false;
      await this.sleep(waitMs);
    }
  }

  /** Replace the token estimate reserved for the last request with the real count. */
  private settleWindow(providerId: string, estimate: number, actual: number): void {
    const entries = this.windows.get(providerId) ?? [];
    const index = entries.findLastIndex((e) => e.tokens === estimate);
    if (index === -1 || actual <= 0) return;
    this.windows.set(providerId, entries.map((e, i) => (i === index ? { at: e.at, tokens: actual } : e)));
  }

  private async loadUsage(): Promise<void> {
    if (this.usage) return;
    const date = utcDate(this.now());
    this.usage = await this.options.usage.loadProviderUsage(date);
    this.topicRequests = await this.options.usage.loadTopicRequests(this.options.topicId, date);
  }

  private async record(provider: AiProvider, tokensIn: number, tokensOut: number): Promise<void> {
    const previous = this.usage?.get(provider.id) ?? { requests: 0, tokens: 0 };
    this.usage?.set(provider.id, { requests: previous.requests + 1, tokens: previous.tokens + tokensIn + tokensOut });
    this.topicRequests++;
    await this.options.usage.recordUsage(provider.id, this.options.topicId, utcDate(this.now()), tokensIn, tokensOut);
  }
}

export function estimateTokens(request: ChatRequest): number {
  return Math.ceil((request.system.length + request.user.length) / CHARS_PER_TOKEN) + request.maxOutputTokens;
}

export function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
