-- Paid web search for the job board (docs/JOBS_PLAN.md §4): budget settings and one more search-only site.
-- Prices read from the Gemini API pricing page on 2026-11-15; edit them here (app_settings) when they change.

insert into public.job_sources (id, name, kind, position) values
  ('topdev', 'TopDev', 'search_only', 12)
on conflict do nothing;

insert into public.app_settings (key, value) values ('job_search_budget', '{
  "model": "gemini-3.5-flash-lite",
  "max_output_tokens": 400,
  "monthly_stop_usd": 0.80,
  "monthly_search_cap": 4000,
  "free_searches_per_month": 5000,
  "usd_per_1k_searches": 14,
  "usd_per_mtok_in": 0.30,
  "usd_per_mtok_out": 2.50,
  "credit_usd": 5,
  "credit_date": "2026-11-15"
}')
on conflict do nothing;
