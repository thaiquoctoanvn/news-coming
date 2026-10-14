// Local dry run of the collect pipeline without Supabase credentials.
// Loads topic config by applying the real migrations to an in-process Postgres (PGlite),
// fetches live sources, and keeps results in memory. Nothing is written anywhere.
// Usage: node scripts/dry-run.ts [topicId]   (optional env: SEC_USER_AGENT)

import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectTopic } from '../src/pipeline/collect.ts';
import { fetchSource } from '../src/sources/index.ts';
import { MemoryStore } from '../src/store/memory-store.ts';
import type { SourceKind, TopicConfig } from '../src/types.ts';

const MIGRATIONS_DIR = join(import.meta.dirname, '../../../supabase/migrations');

// Minimal stand-ins for objects Supabase provides.
const SUPABASE_STUBS = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, last_sign_in_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
`;

async function loadConfig(topicId: string): Promise<TopicConfig> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8').replaceAll('for role postgres ', ''));
  }
  const rows = async <T>(sql: string): Promise<T[]> => (await db.query<T>(sql, [topicId])).rows;
  const sources = await rows<{
    id: string; name: string; kind: SourceKind; url: string | null; query: string | null;
    default_category_id: string | null; default_entity_id: string | null; authority: number;
  }>('select * from sources where topic_id = $1 and enabled');
  const categories = await rows<{ id: string; keywords: string[]; exclude_keywords: string[]; position: number }>(
    'select * from categories where topic_id = $1 and enabled');
  const entities = await rows<{ id: string; aliases: string[]; position: number }>(
    'select * from entities where topic_id = $1 and enabled');
  const [topic] = await rows<{ settings: { exclude_keywords?: string[] } }>('select settings from topics where id = $1');
  await db.close();
  return {
    id: topicId,
    excludeKeywords: topic?.settings.exclude_keywords ?? [],
    sources: sources.map((s) => ({
      id: s.id, name: s.name, kind: s.kind, url: s.url, query: s.query,
      defaultCategoryId: s.default_category_id, defaultEntityId: s.default_entity_id, authority: s.authority,
    })),
    categories: categories.map((c) => ({ id: c.id, keywords: c.keywords, excludeKeywords: c.exclude_keywords, position: c.position })),
    entities: entities.map((e) => ({ id: e.id, aliases: e.aliases, position: e.position })),
  };
}

async function main(): Promise<void> {
  const topicId = process.argv[2] ?? 'macro_finance';
  const config = await loadConfig(topicId);
  const store = new MemoryStore([config]);
  const context = { secUserAgent: process.env.SEC_USER_AGENT };
  const run = () => collectTopic({
    store, topicId, editionId: null, trigger: 'manual', fetchSource: (source) => fetchSource(source, context),
  });

  const first = await run();
  const second = await run();
  const raw = store.articles.filter((a) => a.status === 'raw').sort((a, b) => b.sourceCount - a.sourceCount);
  const byCategory = Object.entries(Object.groupBy(raw, (a) => a.categoryId ?? 'none')).map(([k, v]) => `${k}=${v?.length ?? 0}`);

  const out = [
    `first run:  ${JSON.stringify(first.stats)}`,
    `second run: inserted=${second.stats?.inserted} alreadyStored=${second.stats?.alreadyStored}`,
    `raw by category: ${byCategory.join(', ')}`,
    '', 'top stories by source_count:',
    ...raw.slice(0, 15).map((a) => `  [${a.sourceCount}] (${a.categoryId}/${a.entityId ?? '-'}) a${a.authority} ${a.title.slice(0, 100)} — ${a.sourceName}`),
  ];
  process.stdout.write(`${out.join('\n')}\n`);
}

await main();
