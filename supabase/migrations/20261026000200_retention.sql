-- Retention: daily purge of old data so the free 500 MB database never fills up.
-- Settings per topic (Cấu hình → Cài đặt chung), with floors so a typo cannot wipe recent data:
--   retention_digest_days      published digests and their items        (default 365, min 7)
--   retention_unpublished_days articles never published                   (default 7,   min 3)
--   retention_snippet_days     article text kept after summarizing        (default 30,  min 7)
-- Fixed: run logs, AI usage, button quota, scheduler dispatches 90 days; login attempts 7 days; past events 30 days.
-- Market data is never purged (small, needed by the charts).

-- Flat keys replace the unused nested "retention" object of the seed.
update public.topics
set settings = (settings - 'retention') || jsonb_build_object(
  'retention_digest_days', coalesce((settings->>'retention_digest_days')::int, 365),
  'retention_unpublished_days', coalesce((settings->>'retention_unpublished_days')::int, (settings->'retention'->>'filtered_out_days')::int, 7),
  'retention_snippet_days', coalesce((settings->>'retention_snippet_days')::int, (settings->'retention'->>'snippet_days')::int, 30)
);

create function public.purge_old_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_topic record;
  v_digest_days int;
  v_unpublished_days int;
  v_snippet_days int;
  v_count int;
  v_counts jsonb := '{}'::jsonb;
  v_batch constant int := 20000;
begin
  for v_topic in select id, settings from public.topics loop
    v_digest_days := greatest(coalesce((v_topic.settings->>'retention_digest_days')::int, 365), 7);
    v_unpublished_days := greatest(coalesce((v_topic.settings->>'retention_unpublished_days')::int, 7), 3);
    v_snippet_days := greatest(coalesce((v_topic.settings->>'retention_snippet_days')::int, 30), 7);

    -- Old digests; their items go with them (on delete cascade).
    delete from public.digests
    where id in (
      select id from public.digests
      where topic_id = v_topic.id and digest_date < current_date - v_digest_days
      limit v_batch
    );
    get diagnostics v_count = row_count;
    v_counts := v_counts || jsonb_build_object('digests', coalesce((v_counts->>'digests')::int, 0) + v_count);

    -- Articles not in any remaining digest: unpublished ones after the short window, published ones
    -- (orphaned by the step above) after the digest window. Work in progress is never touched.
    delete from public.articles
    where id in (
      select a.id from public.articles a
      where a.topic_id = v_topic.id
        and a.status not in ('selected', 'summarized')
        and not exists (select 1 from public.digest_items i where i.article_id = a.id)
        and a.fetched_at < now() - make_interval(days => case when a.status = 'translated' then v_digest_days else v_unpublished_days end)
      limit v_batch
    );
    get diagnostics v_count = row_count;
    v_counts := v_counts || jsonb_build_object('articles', coalesce((v_counts->>'articles')::int, 0) + v_count);

    -- Article text is only needed to summarize; the published summary stays.
    update public.articles set content_snippet = null
    where id in (
      select id from public.articles
      where topic_id = v_topic.id
        and content_snippet is not null
        and status not in ('selected', 'summarized')
        and fetched_at < now() - make_interval(days => v_snippet_days)
      limit v_batch
    );
    get diagnostics v_count = row_count;
    v_counts := v_counts || jsonb_build_object('snippets', coalesce((v_counts->>'snippets')::int, 0) + v_count);
  end loop;

  delete from public.crawl_runs where started_at < now() - interval '90 days';
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('crawl_runs', v_count);

  delete from public.ai_usage where usage_date < current_date - 90;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('ai_usage', v_count);

  delete from public.action_quota where usage_date < current_date - 90;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('action_quota', v_count);

  delete from public.schedule_dispatches where dispatched_at < now() - interval '90 days';
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('schedule_dispatches', v_count);

  delete from public.login_attempts where attempted_at < now() - interval '7 days';
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('login_attempts', v_count);

  delete from public.events where starts_at < now() - interval '30 days';
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('events', v_count);

  insert into public.app_settings (key, value)
  values ('last_purge', jsonb_build_object('at', now(), 'counts', v_counts))
  on conflict (key) do update set value = excluded.value;
  return v_counts;
end;
$$;

-- "Dọn ngay" on the operations page: same purge, for a signed-in admin only.
create function public.purge_old_data_now() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return public.purge_old_data();
end;
$$;

-- Database size shown on the operations page (free plan limit: 500 MB).
create function public.database_size_mb() returns numeric
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return round(pg_database_size(current_database()) / 1048576.0, 1);
end;
$$;

revoke all on function public.purge_old_data() from public, anon, authenticated;
revoke all on function public.purge_old_data_now() from public, anon;
revoke all on function public.database_size_mb() from public, anon;
grant execute on function public.purge_old_data() to service_role;
grant execute on function public.purge_old_data_now() to authenticated;
grant execute on function public.database_size_mb() to authenticated;

-- 20:00 UTC = 03:00 in Vietnam, away from the 06:00 and pre-U.S. editions.
select cron.schedule('purge-old-data', '0 20 * * *', 'select public.purge_old_data()');
