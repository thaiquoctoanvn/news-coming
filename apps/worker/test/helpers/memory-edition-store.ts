import { randomUUID } from 'node:crypto';
import type { AiProvider, SelectedItem, UsageTotals } from '../../src/shared.ts';
import type { AddedBy, ArticleQuery, DigestInfo, DigestItemInfo, EditionConfig, EditionStore, NewDigest } from '../../src/shared.ts';
import type { MemoryStore } from '../../src/store/memory-store.ts';
import type { ArticlePatch, ArticleRow } from '../../src/types.ts';

/** In-memory EditionStore on top of a MemoryStore's articles, for pipeline tests. */
export class MemoryEditionStore implements EditionStore {
  patches = new Map<string, ArticlePatch>();
  digests: (NewDigest & { id: string; items: (SelectedItem & { addedBy: AddedBy })[] })[] = [];
  usage: { providerId: string; topicId: string; date: string; tokens: number }[] = [];

  private readonly base: MemoryStore;
  private readonly config: EditionConfig;
  private readonly providers: AiProvider[];

  constructor(base: MemoryStore, config: EditionConfig, providers: AiProvider[]) {
    this.base = base;
    this.config = config;
    this.providers = providers;
  }

  async loadEditionConfig(topicId: string, editionId: string): Promise<EditionConfig | null> {
    return topicId === this.config.topic.id && editionId === this.config.edition.id ? this.config : null;
  }

  async loadAiProviders(): Promise<AiProvider[]> {
    return this.providers;
  }

  async loadProviderUsage(date: string): Promise<Map<string, UsageTotals>> {
    const totals = new Map<string, UsageTotals>();
    for (const u of this.usage.filter((x) => x.date === date)) {
      const prev = totals.get(u.providerId) ?? { requests: 0, tokens: 0 };
      totals.set(u.providerId, { requests: prev.requests + 1, tokens: prev.tokens + u.tokens });
    }
    return totals;
  }

  async loadTopicRequests(topicId: string, date: string): Promise<number> {
    return this.usage.filter((u) => u.topicId === topicId && u.date === date).length;
  }

  async recordUsage(providerId: string, topicId: string, date: string, tokensIn: number, tokensOut: number): Promise<void> {
    this.usage.push({ providerId, topicId, date, tokens: tokensIn + tokensOut });
  }

  async lastDigestWindowEnd(topicId: string): Promise<Date | null> {
    const ends = this.digests.filter((d) => d.topicId === topicId).map((d) => d.windowEnd.getTime());
    return ends.length > 0 ? new Date(Math.max(...ends)) : null;
  }

  async findDigestId(topicId: string, editionId: string, digestDate: string): Promise<string | null> {
    return this.digests.find((d) => d.topicId === topicId && d.editionId === editionId && d.digestDate === digestDate)?.id ?? null;
  }

  async createDigest(digest: NewDigest): Promise<string> {
    const id = randomUUID();
    this.digests.push({ ...digest, id, items: [] });
    return id;
  }

  async addDigestItems(digestId: string, items: readonly SelectedItem[], addedBy: AddedBy = 'auto'): Promise<void> {
    this.digests.find((d) => d.id === digestId)?.items.push(...items.map((i) => ({ ...i, addedBy })));
  }

  async loadDigest(digestId: string): Promise<DigestInfo | null> {
    const d = this.digests.find((x) => x.id === digestId);
    return d ? { id: d.id, topicId: d.topicId, editionId: d.editionId, digestDate: d.digestDate, windowStart: d.windowStart, windowEnd: d.windowEnd } : null;
  }

  async loadDigestItems(digestId: string): Promise<DigestItemInfo[]> {
    const rows = this.rows();
    return (this.digests.find((d) => d.id === digestId)?.items ?? [])
      .map((i) => ({ articleId: i.articleId, position: i.position, storyKey: rows.find((a) => a.id === i.articleId)?.storyKey ?? null }));
  }

  async updateDigestWindowEnd(digestId: string, windowEnd: Date): Promise<void> {
    this.digests = this.digests.map((d) => (d.id === digestId ? { ...d, windowEnd } : d));
  }

  async loadArticles(topicId: string, query: ArticleQuery): Promise<ArticleRow[]> {
    return this.rows().filter((a) => a.topicId === topicId && query.statuses.includes(a.status)
      && (!query.fetchedSince || a.fetchedAt >= query.fetchedSince));
  }

  async updateArticle(id: string, patch: ArticlePatch): Promise<void> {
    this.patches.set(id, { ...this.patches.get(id), ...patch });
  }

  async loadDueEditions(): Promise<{ topicId: string; editionId: string }[]> {
    return [];
  }

  async loadClusterMembers(topicId: string, clusterKey: string, excludeId: string): Promise<ArticleRow[]> {
    return this.rows().filter((a) => a.topicId === topicId && a.clusterKey === clusterKey && a.id !== excludeId);
  }

  /** Articles with all patches applied. */
  rows(): (ArticleRow & ArticlePatch)[] {
    return this.base.articles.map((a) => {
      const patch = this.patches.get(a.id) ?? {};
      return {
        id: a.id, topicId: a.topicId, url: a.url, sourceName: a.sourceName, title: a.title, description: a.description,
        status: a.status, categoryId: a.categoryId, entityId: a.entityId, authority: a.authority, sourceCount: a.sourceCount,
        clusterKey: a.clusterKey, publishedAt: a.publishedAt, fetchedAt: a.fetchedAt, impact: null, direction: null,
        explains: null, finalScore: null, storyKey: null, contentSnippet: null, summaryEn: null, ...patch,
      } as ArticleRow & ArticlePatch;
    });
  }
}
