import { parseArgs } from 'node:util';
import { type Env, loadEnv } from './env.ts';
import { BROWSER_USER_AGENT, fetchText, sleep } from './http.ts';
import { errorMessage, log } from './log.ts';
import { createPageReader } from './jobs/page-reader.ts';
import { runJobs } from './jobs/run.ts';
import { duckDuckGoSearch, geminiSearch } from './jobs/search/engines.ts';
import { JOB_ADAPTERS } from './jobs/sources/index.ts';
import { createSupabaseJobStore } from './jobs/supabase-job-store.ts';
import { jobUsageStore } from './jobs/usage.ts';
import { runDataModules } from './modules/run-modules.ts';
import type { ModuleContext } from './modules/types.ts';
import { collectTopic } from './pipeline/collect.ts';
import { runEdition } from './pipeline/edition.ts';
import { AiRouter, type ApiKeys, callProvider, hasKey } from './shared.ts';
import { fetchSource } from './sources/index.ts';
import { createSupabaseEditionStore } from './shared.ts';
import { createSupabaseModuleStore } from './store/supabase-module-store.ts';
import { createSupabaseStore } from './store/supabase-store.ts';
import type { RunTrigger } from './types.ts';

// Usage:
//   node src/index.ts edition   --edition <id> [--topic <id>|all] [--trigger manual|schedule|backup] [--refresh]
//   node src/index.ts collect   [--topic <id>|all]        (news only, no AI)
//   node src/index.ts modules   [--topic <id>|all]        (prices, yields, calendar only)
//   node src/index.ts catch-up                            (runs editions that are due but did not run today)
//   node src/index.ts verify-ai                           (one tiny request per enabled AI provider)
//   node src/index.ts jobs      [--trigger manual|schedule]   (Android / mobile job scan, docs/JOBS_PLAN.md)

const TRIGGERS: readonly RunTrigger[] = ['schedule', 'manual', 'backup'];

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      topic: { type: 'string', default: 'all' },
      edition: { type: 'string' },
      trigger: { type: 'string', default: 'manual' },
      refresh: { type: 'boolean', default: false },
    },
  });
  const trigger = values.trigger as RunTrigger;
  if (!TRIGGERS.includes(trigger)) throw new Error(`--trigger must be one of ${TRIGGERS.join(', ')}`);
  const env = loadEnv();

  switch (positionals[0]) {
    case 'edition': {
      const editionId = values.edition;
      if (!editionId) throw new Error('edition requires --edition <id>');
      return forEachTopic(env, values.topic, (topicId) => edition(env, topicId, editionId, trigger, values.refresh));
    }
    case 'collect':
      return forEachTopic(env, values.topic, (topicId) => collectTopic({
        store: createSupabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
        topicId, editionId: null, trigger, fetchSource: sourceFetcher(env),
      }));
    case 'modules':
      return forEachTopic(env, values.topic, async (topicId) => {
        const store = createSupabaseModuleStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
        const results = await runDataModules(topicId, store, { ...moduleContext(env), now: new Date() });
        log.info('modules finished', { topicId, results });
      });
    case 'catch-up':
      return catchUp(env);
    case 'verify-ai':
      return verifyAi(env);
    case 'jobs':
      return jobs(env, trigger === 'schedule' ? 'schedule' : 'manual');
    default:
      throw new Error(`Unknown command "${positionals[0] ?? ''}". Expected: edition, collect, modules, catch-up, verify-ai, jobs`);
  }
}

function edition(env: Env, topicId: string, editionId: string, trigger: RunTrigger, refresh = false) {
  return runEdition({
    store: createSupabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    editionStore: createSupabaseEditionStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    topicId,
    editionId,
    trigger,
    refresh,
    fetchSource: sourceFetcher(env),
    keys: apiKeys(env),
    modules: { store: createSupabaseModuleStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY), context: moduleContext(env) },
  });
}

// Job scoring is a handful of requests a day; this cap only stops a runaway loop.
const JOB_AI_REQUESTS_PER_RUN = 20;

async function jobs(env: Env, trigger: 'schedule' | 'manual'): Promise<void> {
  const editionStore = createSupabaseEditionStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const [topicId] = await createSupabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY).listEnabledTopicIds();
  if (!topicId) throw new Error('jobs needs one enabled topic to account AI usage under');
  const router = new AiRouter({
    providers: await editionStore.loadAiProviders(),
    keys: apiKeys(env),
    usage: jobUsageStore(editionStore, topicId),
    topicId,
    topicDailyCap: JOB_AI_REQUESTS_PER_RUN,
    onEvent: (message, fields) => log.warn(message, fields),
  });
  const store = createSupabaseJobStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const budget = await store.loadSearchBudget();
  const searchKey = env.GEMINI_SEARCH_API_KEY;
  await runJobs({
    store,
    reader: createPageReader(),
    router,
    adapters: JOB_ADAPTERS,
    engines: {
      // Paid search needs both the prepaid key and valid budget settings; otherwise only the free route runs.
      ...(searchKey && budget ? { gemini: (query: string) => geminiSearch(query, searchKey, budget) } : {}),
      duckDuckGo: (query) => duckDuckGoSearch(query),
      sleep,
    },
    trigger,
  });
}

async function forEachTopic(env: Env, topic: string | undefined, run: (topicId: string) => Promise<unknown>): Promise<void> {
  const topicIds = !topic || topic === 'all'
    ? await createSupabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY).listEnabledTopicIds()
    : [topic];
  let failed = 0;
  for (const topicId of topicIds) {
    try {
      await run(topicId);
    } catch (error: unknown) {
      failed++;
      log.error('topic run failed', { topicId, error: errorMessage(error) });
    }
  }
  process.exitCode = failed > 0 ? 1 : 0;
}

/** Backup for the pg_cron scheduler: runs every edition that is due but has no run today. */
async function catchUp(env: Env): Promise<void> {
  const due = await createSupabaseEditionStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY).loadDueEditions();
  log.info('catch-up', { due });
  let failed = 0;
  for (const { topicId, editionId } of due) {
    try {
      await edition(env, topicId, editionId, 'backup');
    } catch (error: unknown) {
      failed++;
      log.error('catch-up edition failed', { topicId, editionId, error: errorMessage(error) });
    }
  }
  process.exitCode = failed > 0 ? 1 : 0;
}

function sourceFetcher(env: Env) {
  const context = { secUserAgent: env.SEC_USER_AGENT };
  return (source: Parameters<typeof fetchSource>[0]) => fetchSource(source, context);
}

function moduleContext(env: Env): Omit<ModuleContext, 'now'> {
  return {
    fetchText: (url, headers) => fetchText(url, { headers: { 'User-Agent': BROWSER_USER_AGENT, ...headers } }),
    fredApiKey: env.FRED_API_KEY,
    eiaApiKey: env.EIA_API_KEY,
  };
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
