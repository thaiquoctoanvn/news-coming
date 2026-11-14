-- Job board follow-ups (docs/JOBS_PLAN.md): "Quét ngay" press limit, configurable retention,
-- and the job purge joined to the "Dọn ngay" button.

-- ===== "Quét ngay": its own daily press limit =====
alter table public.action_quota drop constraint if exists action_quota_action_check;
alter table public.action_quota add constraint action_quota_action_check
  check (action in ('more', 'refresh', 'assist', 'jobs'));

insert into public.app_settings (key, value) values
  ('job_scan', '{"daily_cap": 3}'),
  -- Days a job is kept after it was last seen on a source (minimum 21, enforced in purge_old_jobs).
  ('job_retention', '{"days": 30}')
on conflict do nothing;

-- ===== Retention =====
-- Jobs: `job_retention.days` after they were last seen (default 30, never less than 21, so a job
--   cannot be purged and found again as "new" within the 14-day reminder window).
-- Closed jobs: 30 days (kept that long only so the same closed posting is not read again).
-- Posting text: 7 days after the job was reported; score, reason and link stay.
-- Run logs 90 days; the spend ledger 400 days (prepaid credit lasts 12 months).
create or replace function public.purge_old_jobs() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_setting text;
  v_days int;
  v_count int;
  v_counts jsonb := '{}'::jsonb;
begin
  select value->>'days' into v_setting from public.app_settings where key = 'job_retention';
  -- A missing or malformed setting falls back to the default instead of failing the nightly job.
  v_days := greatest(case when v_setting ~ '^\d{1,4}$' then v_setting::int else 30 end, 21);

  delete from public.jobs
  where last_seen_at < now() - make_interval(days => v_days)
     or (verification = 'closed' and last_seen_at < now() - interval '30 days');
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('jobs', v_count);

  update public.jobs set detail_text = null
  where detail_text is not null and report_date is not null and report_date < current_date - 7;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('job_texts', v_count);

  delete from public.job_runs where started_at < now() - interval '90 days';
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('job_runs', v_count);

  delete from public.search_spend where usage_date < current_date - 400;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('search_spend', v_count);

  -- Shown on the operations page next to the main purge's counts.
  update public.app_settings
  set value = jsonb_set(value, '{counts}', coalesce(value->'counts', '{}'::jsonb) || v_counts)
  where key = 'last_purge';
  return v_counts;
end;
$$;

-- "Dọn ngay" now also purges the job board.
create or replace function public.purge_old_data_now() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return public.purge_old_data() || public.purge_old_jobs();
end;
$$;
