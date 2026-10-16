-- RLS / grants contract (docs/DESIGN.md §10.1). Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

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

select * from finish();
rollback;
