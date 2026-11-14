-- Job board access contract (docs/JOBS_PLAN.md §5). Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into public.jobs (source_id, url, url_hash, title, verification, score, tier, report_date)
values ('itviec', 'https://example.com/job-1', 'job-1', 'Android Developer', 'verified', 8, 'fit', current_date);
insert into public.job_runs (trigger, status) values ('manual', 'success');
select public.record_search_spend('gemini_search', current_date, 2, 40, 1500, 0.0012);
select public.record_search_spend('gemini_search', current_date, 1, 60, 500, 0.0008);

select results_eq(
  $$ select calls, searches, tokens_in::int, tokens_out::int, cost_usd from public.search_spend $$,
  $$ values (2, 3, 100, 2000, 0.002000::numeric(12, 6)) $$,
  'search spend adds up per engine and day'
);

select results_eq(
  $$ select (value->>'monthly_stop_usd')::numeric < 1 from public.app_settings where key = 'job_search_budget' $$,
  $$ values (true) $$,
  'paid search stops below 1 USD a month'
);

-- ===== Public visitor =====
set local role anon;
select throws_ok($$ select * from public.jobs $$, '42501', null, 'anon cannot read jobs');
select throws_ok($$ select * from public.job_sources $$, '42501', null, 'anon cannot read job sources');
select throws_ok($$ select * from public.job_runs $$, '42501', null, 'anon cannot read job runs');
select throws_ok($$ select * from public.search_spend $$, '42501', null, 'anon cannot read search spend');
select throws_ok(
  $$ select public.record_search_spend('gemini_search', current_date, 1, 1, 1, 1) $$,
  '42501', null, 'anon cannot write search spend'
);
select throws_ok($$ select public.purge_old_jobs() $$, '42501', null, 'anon cannot purge jobs');

-- ===== Admin session older than 15 days =====
reset role;
insert into auth.users (id, last_sign_in_at)
values ('00000000-0000-0000-0000-0000000000c1', now() - interval '20 days');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
select is_empty($$ select id from public.jobs $$, 'expired admin cannot read jobs');
select is_empty(
  $$ update public.job_sources set enabled = false where id = 'itviec' returning id $$,
  'expired admin cannot switch sources'
);

-- ===== Fresh admin session =====
reset role;
update auth.users set last_sign_in_at = now() where id = '00000000-0000-0000-0000-0000000000c1';
set local role authenticated;
select results_eq($$ select title from public.jobs $$, $$ values ('Android Developer'::text) $$, 'admin reads jobs');
select isnt_empty($$ select 1 from public.search_spend $$, 'admin reads search spend');
select isnt_empty(
  $$ update public.job_sources set enabled = false where id = 'itviec' returning id $$,
  'admin switches a source off'
);
select throws_ok(
  $$ update public.job_sources set name = 'x' where id = 'itviec' $$, '42501', null, 'admin cannot rename a source'
);
select throws_ok(
  $$ update public.jobs set score = 10 where url_hash = 'job-1' $$, '42501', null, 'admin cannot edit jobs'
);

-- ===== Retention =====
reset role;
insert into public.jobs (source_id, url, url_hash, title, verification, report_date, detail_text, last_seen_at) values
  ('itviec', 'https://example.com/job-old', 'job-old', 'Old job', 'verified', current_date - 40, 'text', now() - interval '35 days'),
  ('itviec', 'https://example.com/job-kept', 'job-kept', 'Reported last week', 'verified', current_date - 10, 'text', now() - interval '2 days'),
  ('itviec', 'https://example.com/job-fresh', 'job-fresh', 'Reported yesterday', 'verified', current_date - 1, 'text', now());
select public.purge_old_jobs();
select results_eq(
  $$ select url_hash, detail_text is not null from public.jobs order by url_hash $$,
  $$ values ('job-1'::text, false), ('job-fresh', true), ('job-kept', false) $$,
  'purge removes jobs not seen for 30 days and drops posting text a week after the report'
);

update public.app_settings set value = '{"days": 5}' where key = 'job_retention';
update public.jobs set last_seen_at = now() - interval '10 days' where url_hash = 'job-kept';
select public.purge_old_jobs();
select isnt_empty($$ select 1 from public.jobs where url_hash = 'job-kept' $$, 'retention never goes below 21 days');

update public.app_settings set value = '{"days": "abc"}' where key = 'job_retention';
select lives_ok($$ select public.purge_old_jobs() $$, 'a malformed retention setting does not break the purge');

-- ===== "Quét ngay" press limit =====
select is(public.use_action_quota('macro_finance', 'jobs', 1), true, 'the first scan press of the day is allowed');
select is(public.use_action_quota('macro_finance', 'jobs', 1), false, 'presses beyond the daily cap are refused');

update auth.users set last_sign_in_at = now() - interval '20 days' where id = '00000000-0000-0000-0000-0000000000c1';
set local role authenticated;
select throws_ok($$ select public.purge_old_data_now() $$, '42501', null, 'expired admin cannot purge jobs through "Dọn ngay"');

select * from finish();
rollback;
