-- Job board (docs/JOBS_PLAN.md): Android / mobile job postings for the admin only.
-- Own tables instead of a topic: every public policy is topic-based, so nothing here can reach anon.

-- ===== Configuration =====

-- Where postings come from. The URLs and parsing live in the worker; this table only switches them.
--   direct       listing and posting pages are readable -> postings are verified
--   listing_only the listing is readable, the posting page is not -> shown as unverified
--   search_only  the site blocks the worker -> postings are found through a search engine
--   engine       a web search route used for search_only sites and general queries
create table public.job_sources (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('direct', 'listing_only', 'search_only', 'engine')),
  position smallint not null default 0,
  enabled boolean not null default true
);

-- ===== Data =====

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.job_sources,
  -- The engine that found a posting of a search_only site; null when read from the site itself.
  found_via text references public.job_sources,
  url text not null,
  url_hash text not null unique,
  -- Normalized "company|title": the same position posted again under a new link is one job.
  dedupe_key text,
  title text not null,
  company text,
  location text,
  salary text,
  -- As shown by the site, e.g. "Làm mới 07/11" (boards bump old postings, so this is not a date).
  posted_text text,
  deadline date,
  -- Text of the posting page, kept only to score it.
  detail_text text,
  verification text not null default 'pending' check (verification in ('pending', 'verified', 'unverified', 'closed')),
  verification_note text,
  score smallint check (score between 1 and 10),
  reason text,
  tip text,
  tier text check (tier in ('top', 'fit', 'maybe', 'low', 'unverified')),
  -- A known job whose salary or deadline changed is reported again.
  is_update boolean not null default false,
  -- The day (Vietnam time) the job appears on the page; null until it is scored.
  report_date date,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index jobs_report_idx on public.jobs (report_date desc, score desc);
create index jobs_dedupe_idx on public.jobs (dedupe_key) where dedupe_key is not null;
create index jobs_pending_idx on public.jobs (first_seen_at) where report_date is null;

create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null check (trigger in ('schedule', 'manual')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  -- { found, new, closed, unverified, scored, sources: { <id>: { found, error } } }
  stats jsonb not null default '{}',
  error text
);
create index job_runs_started_idx on public.job_runs (started_at desc);

-- Paid web search ledger (docs/JOBS_PLAN.md §4): one row per engine and UTC day.
create table public.search_spend (
  engine_id text not null references public.job_sources on delete cascade,
  usage_date date not null,
  calls int not null default 0,
  searches int not null default 0,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  primary key (engine_id, usage_date)
);

-- Atomic counter; only the worker calls it.
create function public.record_search_spend(
  p_engine_id text, p_usage_date date, p_searches int, p_tokens_in int, p_tokens_out int, p_cost_usd numeric
) returns void
language sql security definer set search_path = '' as $$
  insert into public.search_spend (engine_id, usage_date, calls, searches, tokens_in, tokens_out, cost_usd)
  values (p_engine_id, p_usage_date, 1, p_searches, p_tokens_in, p_tokens_out, p_cost_usd)
  on conflict (engine_id, usage_date) do update set
    calls = public.search_spend.calls + 1,
    searches = public.search_spend.searches + excluded.searches,
    tokens_in = public.search_spend.tokens_in + excluded.tokens_in,
    tokens_out = public.search_spend.tokens_out + excluded.tokens_out,
    cost_usd = public.search_spend.cost_usd + excluded.cost_usd;
$$;
revoke all on function public.record_search_spend(text, date, int, int, int, numeric) from public, anon, authenticated;
grant execute on function public.record_search_spend(text, date, int, int, int, numeric) to service_role;

-- ===== Access: admin reads, worker writes, the public gets nothing =====

alter table public.job_sources enable row level security;
alter table public.jobs enable row level security;
alter table public.job_runs enable row level security;
alter table public.search_spend enable row level security;

grant all on public.job_sources, public.jobs, public.job_runs, public.search_spend to service_role;
grant select on public.job_sources, public.jobs, public.job_runs, public.search_spend to authenticated;
-- The admin only switches sources on and off.
grant update (enabled) on public.job_sources to authenticated;

create policy job_sources_admin_read on public.job_sources
  for select to authenticated using (public.is_admin());
create policy job_sources_admin_update on public.job_sources
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy jobs_admin_read on public.jobs
  for select to authenticated using (public.is_admin());
create policy job_runs_admin_read on public.job_runs
  for select to authenticated using (public.is_admin());
create policy search_spend_admin_read on public.search_spend
  for select to authenticated using (public.is_admin());

-- ===== Retention =====

-- Jobs and run logs 90 days after they were last seen. The spend ledger is kept 400 days: prepaid
-- search credit lasts 12 months and the remaining balance is computed from this table.
create function public.purge_old_jobs() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
  v_counts jsonb := '{}'::jsonb;
begin
  delete from public.jobs where last_seen_at < now() - interval '90 days';
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('jobs', v_count);

  delete from public.job_runs where started_at < now() - interval '90 days';
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('job_runs', v_count);

  delete from public.search_spend where usage_date < current_date - 400;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('search_spend', v_count);
  return v_counts;
end;
$$;
revoke all on function public.purge_old_jobs() from public, anon, authenticated;
grant execute on function public.purge_old_jobs() to service_role;

-- 20:10 UTC = 03:10 in Vietnam, right after the main purge.
select cron.schedule('purge-old-jobs', '10 20 * * *', 'select public.purge_old_jobs()');

-- ===== Seed (verified from GitHub Actions on 2026-11-14, docs/JOBS_PLAN.md §3) =====

insert into public.job_sources (id, name, kind, position) values
  ('itviec', 'ITviec', 'direct', 1),
  ('vietnamworks', 'VietnamWorks', 'direct', 2),
  ('linkedin', 'LinkedIn', 'direct', 3),
  ('careerviet', 'CareerViet', 'direct', 4),
  ('vng', 'VNG', 'direct', 5),
  ('grab', 'Grab', 'direct', 6),
  ('cake', 'Cake by VPBank', 'direct', 7),
  ('glassdoor', 'Glassdoor', 'listing_only', 8),
  ('topcv', 'TopCV', 'search_only', 9),
  ('jobsgo', 'JobsGo', 'search_only', 10),
  ('indeed', 'Indeed', 'search_only', 11),
  ('gemini_search', 'Gemini (Google Search)', 'engine', 20),
  ('duckduckgo', 'DuckDuckGo', 'engine', 21)
on conflict do nothing;
