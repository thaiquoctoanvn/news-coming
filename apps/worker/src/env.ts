import { z } from 'zod';

const envSchema = z.object({
  // supabase-js appends /rest/v1 itself; a URL copied from the Data API page already
  // contains it and every request then fails with "Invalid path specified in request URL".
  SUPABASE_URL: z.url().transform((value) => new URL(value).origin),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SEC_USER_AGENT: z
    .string()
    .regex(/\S+@\S+\.\S+/, 'must contain a contact email (SEC requirement)')
    .optional(),
  GROQ_API_KEY: z.string().min(10).optional(),
  GEMINI_API_KEY: z.string().min(10).optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Validates required secrets at startup so a misconfigured run fails before doing any work. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse({
    ...source,
    SEC_USER_AGENT: source.SEC_USER_AGENT || undefined,
    GROQ_API_KEY: source.GROQ_API_KEY || undefined,
    GEMINI_API_KEY: source.GEMINI_API_KEY || undefined,
  });
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid environment — ${problems}`);
  }
  return result.data;
}
