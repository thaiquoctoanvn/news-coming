import type { UsageStore, UsageTotals } from '../shared.ts';

// The AI router accounts usage per topic (ai_usage.topic_id). Job scoring has no topic of its own:
// it shares the providers' daily free quota with the digest, so its requests are recorded under an
// existing topic to keep that quota honest, while its own cap is counted per run.

export function jobUsageStore(base: UsageStore, topicId: string): UsageStore {
  return {
    loadProviderUsage: (date: string): Promise<Map<string, UsageTotals>> => base.loadProviderUsage(date),
    // Start each run at zero: the router then stops at the job run's own request cap.
    loadTopicRequests: async (): Promise<number> => 0,
    recordUsage: (providerId, _topicId, date, tokensIn, tokensOut): Promise<void> =>
      base.recordUsage(providerId, topicId, date, tokensIn, tokensOut),
  };
}
