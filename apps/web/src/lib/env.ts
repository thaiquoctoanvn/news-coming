import { z } from 'zod';

// Public build-time settings. The anon key is safe in the browser: every table is protected by RLS.
const schema = z.object({
  VITE_SUPABASE_URL: z.url().transform((value) => new URL(value).origin),
  VITE_SUPABASE_ANON_KEY: z.string().min(20),
});

export type WebEnv = z.infer<typeof schema>;

export function readEnv(source: Record<string, unknown> = import.meta.env): WebEnv | null {
  const result = schema.safeParse(source);
  return result.success ? result.data : null;
}
