-- Scheduler (DESIGN.md §3.1): every 5 minutes pg_cron finds editions whose local time has come and
-- asks GitHub Actions to run them (workflow_dispatch). GitHub's own daily schedule is the backup.
-- The GitHub token is NOT in this migration: store it once in Vault (see docs/DESIGN.md §3.1).

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

insert into public.app_settings (key, value)
values ('github_dispatch', '{"repo": "thaiquoctoanvn/news-coming", "workflow": "run.yml", "ref": "main"}')
on conflict do nothing;

create table public.schedule_dispatches (
  id bigint generated always as identity primary key,
  topic_id text not null references public.topics on delete cascade,
  edition_id text not null,
  local_date date not null,
  dispatched_at timestamptz not null default now(),
  request_id bigint
);
create index schedule_dispatches_lookup_idx on public.schedule_dispatches (topic_id, edition_id, local_date);
alter table public.schedule_dispatches enable row level security;
grant select on public.schedule_dispatches to authenticated;
grant all on public.schedule_dispatches to service_role;
create policy schedule_dispatches_admin_read on public.schedule_dispatches
  for select to authenticated using (public.is_admin());

-- Editions due now: enabled, right weekday, within 6 hours after their local time, and without a
-- finished run (or a run started in the last hour) today in their own time zone.
create function public.due_editions(p_now timestamptz default now())
returns table (topic_id text, edition_id text, local_date date)
language sql stable security definer set search_path = '' as $$
  select e.topic_id, e.id, (p_now at time zone e.timezone)::date
  from public.editions e
  join public.topics t on t.id = e.topic_id and t.enabled
  where e.enabled
    and extract(isodow from (p_now at time zone e.timezone))::smallint = any (e.weekdays)
    and (p_now at time zone e.timezone)::time - e.local_time between interval '0' and interval '6 hours'
    and not exists (
      select 1 from public.crawl_runs r
      where r.topic_id = e.topic_id
        and r.edition_id = e.id
        and (r.started_at at time zone e.timezone)::date = (p_now at time zone e.timezone)::date
        and (r.status in ('success', 'partial') or (r.status = 'running' and r.started_at > p_now - interval '1 hour'))
    );
$$;

-- Dispatches each due edition at most every 30 minutes and 3 times a day (a failed run is retried).
create function public.dispatch_due_editions() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_token text;
  v_config jsonb;
  v_due record;
  v_request bigint;
  v_count integer := 0;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'github_dispatch_token';
  if v_token is null then
    return 0;
  end if;
  select value into v_config from public.app_settings where key = 'github_dispatch';

  for v_due in select * from public.due_editions() loop
    continue when exists (
      select 1 from public.schedule_dispatches d
      where d.topic_id = v_due.topic_id and d.edition_id = v_due.edition_id and d.local_date = v_due.local_date
        and d.dispatched_at > now() - interval '30 minutes'
    );
    continue when (
      select count(*) from public.schedule_dispatches d
      where d.topic_id = v_due.topic_id and d.edition_id = v_due.edition_id and d.local_date = v_due.local_date
    ) >= 3;

    select net.http_post(
      url := format('https://api.github.com/repos/%s/actions/workflows/%s/dispatches', v_config->>'repo', v_config->>'workflow'),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_token,
        'Accept', 'application/vnd.github+json',
        'X-GitHub-Api-Version', '2022-11-28',
        'User-Agent', 'news-coming-scheduler',
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'ref', v_config->>'ref',
        'inputs', jsonb_build_object('command', 'edition', 'topic', v_due.topic_id, 'edition', v_due.edition_id, 'trigger', 'schedule')
      )
    ) into v_request;

    insert into public.schedule_dispatches (topic_id, edition_id, local_date, request_id)
    values (v_due.topic_id, v_due.edition_id, v_due.local_date, v_request);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.due_editions(timestamptz) from public, anon, authenticated;
revoke all on function public.dispatch_due_editions() from public, anon, authenticated;
grant execute on function public.due_editions(timestamptz) to service_role;

select cron.schedule('dispatch-due-editions', '*/5 * * * *', 'select public.dispatch_due_editions()');
