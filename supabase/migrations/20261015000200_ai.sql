-- Phase 3 (AI): provider limits, usage accounting, article fields for scoring and content.

alter table public.ai_providers
  add column daily_token_limit int check (daily_token_limit > 0),
  add column tpm_limit int check (tpm_limit > 0),
  -- Extra request parameters per provider, e.g. {"reasoning_effort": "low"} for Groq,
  -- {"generationConfig": {...}, "inlineSystem": true} for Gemini/Gemma.
  add column request_options jsonb not null default '{}';

alter table public.articles
  add column original_url text,
  add column scored_at timestamptz;

-- Atomic usage counter (one row per provider, topic and UTC day). Only the worker / Edge Functions call it.
create function public.record_ai_usage(
  p_provider_id text, p_topic_id text, p_usage_date date, p_tokens_in int, p_tokens_out int
) returns void
language sql security definer set search_path = '' as $$
  insert into public.ai_usage (provider_id, topic_id, usage_date, requests, tokens_in, tokens_out)
  values (p_provider_id, p_topic_id, p_usage_date, 1, p_tokens_in, p_tokens_out)
  on conflict (provider_id, topic_id, usage_date) do update set
    requests = public.ai_usage.requests + 1,
    tokens_in = public.ai_usage.tokens_in + excluded.tokens_in,
    tokens_out = public.ai_usage.tokens_out + excluded.tokens_out;
$$;
revoke all on function public.record_ai_usage(text, text, date, int, int) from public, anon, authenticated;
grant execute on function public.record_ai_usage(text, text, date, int, int) to service_role;

-- Free-tier limits as shown in the Groq console and Google AI Studio on 2026-10-15.
-- The router stops using a provider at 80% of any daily limit (.agents/rules/cost.md).
insert into public.ai_providers
  (id, role, provider, model, priority, daily_request_limit, daily_token_limit, rpm_limit, tpm_limit, request_options)
values
  ('groq-gpt-oss-120b', 'extract', 'groq', 'openai/gpt-oss-120b', 1, 1000, 200000, 30, 8000, '{"reasoning_effort": "low"}'),
  ('groq-qwen3.8-27b', 'extract', 'groq', 'qwen/qwen3.8-27b', 2, 1000, 200000, 30, 8000, '{}'),
  ('groq-gpt-oss-20b', 'extract', 'groq', 'openai/gpt-oss-20b', 3, 1000, 200000, 30, 8000, '{"reasoning_effort": "low"}'),
  ('gemini-gemma-4-31b', 'extract', 'gemini', 'gemma-4-31b-it', 4, 14400, null, 30, 16000, '{"inlineSystem": true}'),
  ('gemini-3.5-flash-lite', 'translate', 'gemini', 'gemini-3.5-flash-lite', 1, 500, null, 15, 250000,
    '{"generationConfig": {"responseMimeType": "application/json"}}'),
  ('gemini-3.1-flash-lite', 'translate', 'gemini', 'gemini-3.1-flash-lite', 2, 500, null, 15, 250000,
    '{"generationConfig": {"responseMimeType": "application/json"}}'),
  ('gemini-gemma-4-31b-translate', 'translate', 'gemini', 'gemma-4-31b-it', 3, 14400, null, 30, 16000, '{"inlineSystem": true}'),
  ('groq-gpt-oss-120b-translate', 'translate', 'groq', 'openai/gpt-oss-120b', 4, 1000, 200000, 30, 8000, '{"reasoning_effort": "low"}')
on conflict do nothing;
