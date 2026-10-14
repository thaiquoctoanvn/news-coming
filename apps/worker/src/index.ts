import { parseArgs } from 'node:util';
import { loadEnv } from './env.ts';
import { errorMessage, log } from './log.ts';
import { collectTopic } from './pipeline/collect.ts';
import { fetchSource } from './sources/index.ts';
import { createSupabaseStore } from './store/supabase-store.ts';
import type { RunTrigger } from './types.ts';

// Usage: node src/index.ts collect [--topic <id>|all] [--edition <id>] [--trigger manual|schedule|backup]

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

  const [command] = positionals;
  if (command !== 'collect') throw new Error(`Unknown command "${command ?? ''}". Expected: collect`);
  const trigger = values.trigger as RunTrigger;
  if (!TRIGGERS.includes(trigger)) throw new Error(`--trigger must be one of ${TRIGGERS.join(', ')}`);

  const env = loadEnv();
  const store = createSupabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const topicIds = values.topic === 'all' ? await store.listEnabledTopicIds() : [values.topic];
  const context = { secUserAgent: env.SEC_USER_AGENT };

  let failed = 0;
  for (const topicId of topicIds) {
    try {
      await collectTopic({
        store,
        topicId,
        editionId: values.edition ?? null,
        trigger,
        fetchSource: (source) => fetchSource(source, context),
      });
    } catch (error: unknown) {
      failed++;
      log.error('collect failed', { topicId, error: errorMessage(error) });
    }
  }
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((error: unknown) => {
  log.error('worker crashed', { error: errorMessage(error) });
  process.exitCode = 1;
});
