import type { z } from 'zod';

/** Parses a model's JSON answer (tolerating ``` fences or text around the object) and validates it. */
export function parseModelJson<T>(text: string, schema: z.ZodType<T>): T {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error(`Model answer has no JSON object: ${text.slice(0, 120)}`);
  const parsed: unknown = JSON.parse(text.slice(start, end + 1));
  return schema.parse(parsed);
}
