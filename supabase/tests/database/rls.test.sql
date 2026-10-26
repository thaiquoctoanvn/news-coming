-- RLS / grants contract (docs/DESIGN.md §10.1). Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- ===== Public visitor =====
set local role anon;

select results_eq(
  $$ select id from public.topics $$,
  $$ values ('macro_finance'::text) $$,
  'anon sees enabled topics'
);
select throws_ok($$ select * from public.sources $$, '42501', null, 'anon cannot read sources');
select throws_ok($$ select scoring_guide from public.topics $$, '42501', null, 'anon cannot read scoring guide');
select throws_ok($$ select * from public.crawl_runs $$, '42501', null, 'anon cannot read crawl runs');
select throws_ok($$ select title from public.articles $$, '42501', null, 'anon cannot read original article text');
select throws_ok(
  $$ insert into public.topics (id, name_vi, scoring_guide) values ('x', 'x', 'x') $$,
  '42501', null, 'anon cannot create topics'
);
select throws_ok(
  $$ select public.record_ai_usage('groq-gpt-oss-120b', 'macro_finance', current_date, 1, 1) $$,
  '42501', null, 'anon cannot write AI usage'
);

select throws_ok($$ select * from public.due_editions() $$, '42501', null, 'anon cannot call the scheduler');
select throws_ok(
  $$ select public.use_action_quota('macro_finance', 'more', 5) $$, '42501', null, 'anon cannot use button quota'
);

-- ===== Scheduler: editions due at their local time, once per day =====
reset role;
select results_eq(
  $$ select topic_id, edition_id from public.due_editions('2026-10-16 23:30:00+00') $$,
  $$ values ('macro_finance'::text, 'morning'::text) $$,
  '06:30 in Vietnam: the morning edition is due'
);
select is_empty(
  $$ select 1 from public.due_editions('2026-10-17 13:00:00+00') where edition_id = 'pre_us' $$,
  'pre_us is not due on a Saturday'
);
insert into public.crawl_runs (topic_id, edition_id, trigger, started_at, status)
values ('macro_finance', 'morning', 'schedule', '2026-10-16 23:05:00+00', 'success');
select is_empty(
  $$ select 1 from public.due_editions('2026-10-16 23:30:00+00') $$,
  'an edition that already ran today is not due again'
);
set local role anon;

-- ===== Button quota: stops at the daily cap =====
reset role;
select results_eq(
  $$ select public.use_action_quota('macro_finance', 'refresh', 2) union all
     select public.use_action_quota('macro_finance', 'refresh', 2) $$,
  $$ values (true), (true) $$,
  'the first presses up to the cap are allowed'
);
select is(public.use_action_quota('macro_finance', 'refresh', 2), false, 'a press beyond the daily cap is refused');
set local role anon;

-- ===== Disabled topic disappears for the public =====
reset role;
insert into public.articles (topic_id, source_name, url, url_hash, title, status, title_vi)
values ('macro_finance', 'Test', 'https://example.com/a', 'hash-a', 'Title', 'translated', 'Tiêu đề');
update public.topics set enabled = false where id = 'macro_finance';
set local role anon;

select is_empty($$ select id from public.topics $$, 'disabled topic hidden');
select is_empty($$ select id from public.categories $$, 'categories of disabled topic hidden');
select is_empty($$ select id from public.articles $$, 'articles of disabled topic hidden');

reset role;
update public.topics set enabled = true where id = 'macro_finance';
set local role anon;
select results_eq(
  $$ select title_vi from public.articles $$,
  $$ values ('Tiêu đề'::text) $$,
  'translated articles of enabled topic are public'
);

-- ===== Admin session older than 15 days cannot write =====
reset role;
insert into auth.users (id, last_sign_in_at)
values ('00000000-0000-0000-0000-0000000000a1', now() - interval '20 days');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

select is_empty(
  $$ update public.topics set position = 9 where id = 'macro_finance' returning id $$,
  'expired admin cannot update config'
);
select is_empty($$ select id from public.sources $$, 'expired admin cannot read sources');

-- ===== Fresh admin session can write =====
reset role;
update auth.users set last_sign_in_at = now() where id = '00000000-0000-0000-0000-0000000000a1';
set local role authenticated;

select isnt_empty(
  $$ update public.topics set position = 9 where id = 'macro_finance' returning id $$,
  'admin can update config'
);
select throws_ok($$ select * from public.login_attempts $$, '42501', null, 'admin cannot read login attempts');
select lives_ok($$ select public.purge_old_data_now() $$, 'admin can run "Dọn ngay"');
select ok((select public.database_size_mb()) > 0, 'admin sees the database size');

-- ===== Retention =====
reset role;
insert into public.articles (id, topic_id, source_name, url_hash, url, title, status, fetched_at, content_snippet) values
  ('00000000-0000-0000-0000-0000000000b1', 'macro_finance', 'x', 'rt1', 'https://x/1', 'old filtered', 'filtered_out', now() - interval '10 days', 'text'),
  ('00000000-0000-0000-0000-0000000000b2', 'macro_finance', 'x', 'rt2', 'https://x/2', 'old selected', 'selected', now() - interval '40 days', 'text'),
  ('00000000-0000-0000-0000-0000000000b3', 'macro_finance', 'x', 'rt3', 'https://x/3', 'fresh raw', 'raw', now(), 'text');
select public.purge_old_data();
select results_eq(
  $$ select title, content_snippet is not null from public.articles where url_hash like 'rt%' order by title $$,
  $$ values ('fresh raw'::text, true), ('old selected', true) $$,
  'purge removes old unpublished articles and never touches work in progress'
);

set local role anon;
select throws_ok($$ select public.purge_old_data_now() $$, '42501', null, 'anon cannot purge');
reset role;
update auth.users set last_sign_in_at = now() - interval '20 days' where id = '00000000-0000-0000-0000-0000000000a1';
set local role authenticated;
select throws_ok($$ select public.purge_old_data_now() $$, '42501', null, 'expired admin cannot purge');

select * from finish();
rollback;
