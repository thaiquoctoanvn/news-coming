import { parseArgs } from 'node:util';
import { type Env, loadEnv } from './env.ts';
import { errorMessage, log } from './log.ts';
import { collectTopic } from './pipeline/collect.ts';
import { runEdition } from './pipeline/edition.ts';
import { type ApiKeys, callProvider, hasKey } from './shared.ts';
import { fetchSource } from './sources/index.ts';
import { createSupabaseEditionStore } from './store/supabase-edition-store.ts';
import { createSupabaseStore } from './store/supabase-store.ts';
import type { RunTrigger } from './types.ts';

// Usage:
//   node src/index.ts collect   [--topic <id>|all] [--trigger manual|schedule|backup]
//   node src/index.ts edition   --edition <id> [--topic <id>|all] [--trigger …]
//   node src/index.ts verify-ai   (one tiny request per enabled AI provider)

const TRIGGERS: readonly RunTrigger[] = ['schedule', 'manual', 'backup'];

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      topic: { type: 'string', default: 'all' },
      edition: { type: 'string' },
      trigger: { type: 'string', default: 'manual' },
    },
  });
  const trigger = values.trigger as RunTrigger;
  if (!TRIGGERS.includes(trigger)) throw new Error(`--trigger must be one of ${TRIGGERS.join(', ')}`);
  const env = loadEnv();

  switch (positionals[0]) {
    case 'collect':
      return forEachTopic(env, values.topic, (store, topicId) => collectTopic({
        store, topicId, editionId: values.edition ?? null, trigger, fetchSource: sourceFetcher(env),
      }));
    case 'edition': {
      const editionId = values.edition;
      if (!editionId) throw new Error('edition requires --edition <id>');
      const editionStore = createSupabaseEditionStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      return forEachTopic(env, values.topic, (store, topicId) => runEdition({
        store, editionStore, topicId, editionId, trigger, fetchSource: sourceFetcher(env), keys: apiKeys(env),
      }));
    }
    case 'verify-ai':
      return verifyAi(env);
    default:
      throw new Error(`Unknown command "${positionals[0] ?? ''}". Expected: collect, edition, verify-ai`);
  }
}

async function forEachTopic(
  env: Env,
  topic: string | undefined,
  run: (store: ReturnType<typeof createSupabaseStore>, topicId: string) => Promise<unknown>,
): Promise<void> {
  const store = createSupabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const topicIds = !topic || topic === 'all' ? await store.listEnabledTopicIds() : [topic];
  let failed = 0;
  for (const topicId of topicIds) {
    try {
      await run(store, topicId);
    } catch (error: unknown) {
      failed++;
      log.error('topic run failed', { topicId, error: errorMessage(error) });
    }
  }
  process.exitCode = failed > 0 ? 1 : 0;
}

function sourceFetcher(env: Env) {
  const context = { secUserAgent: env.SEC_USER_AGENT };
  return (source: Parameters<typeof fetchSource>[0]) => fetchSource(source, context);
}

function apiKeys(env: Env): ApiKeys {
  return { groq: env.GROQ_API_KEY, gemini: env.GEMINI_API_KEY };
}

/** Confirms each enabled provider's key and model id with one tiny request (not counted in ai_usage). */
async function verifyAi(env: Env): Promise<void> {
  const providers = await createSupabaseEditionStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY).loadAiProviders();
  const keys = apiKeys(env);
  let failed = 0;
  for (const provider of providers.sort((a, b) => a.role.localeCompare(b.role) || a.priority - b.priority)) {
    const label = `${provider.role}#${provider.priority} ${provider.id} (${provider.model})`;
    if (!hasKey(provider, keys)) {
      log.warn('no api key', { provider: label });
      failed++;
      continue;
    }
    try {
      const response = await callProvider(provider, {
        system: 'Reply with JSON only.', user: 'Return {"ok": true}', maxOutputTokens: 300,
      }, keys);
      log.info('provider ok', { provider: label, answer: response.text.slice(0, 60), tokens: response.tokensIn + response.tokensOut });
    } catch (error: unknown) {
      failed++;
      log.error('provider failed', { provider: label, error: errorMessage(error).slice(0, 300) });
    }
  }
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((error: unknown) => {
  log.error('worker crashed', { error: errorMessage(error) });
  process.exitCode = 1;
});
