import { z } from 'zod';

const envSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SEC_USER_AGENT: z
    .string()
    .regex(/\S+@\S+\.\S+/, 'must contain a contact email (SEC requirement)')
    .optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Validates required secrets at startup so a misconfigured run fails before doing any work. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse({
    ...source,
    SEC_USER_AGENT: source.SEC_USER_AGENT || undefined,
  });
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid environment — ${problems}`);
  }
  return result.data;
}
