-- Phase 6 (admin): login rate limits, button quotas, items added after the edition.

-- Items appended by the "Cập nhật tin mới" button (worker run with --refresh).
alter table public.digest_items drop constraint if exists digest_items_added_by_check;
alter table public.digest_items add constraint digest_items_added_by_check check (added_by in ('auto', 'more', 'refresh'));

-- Login attempts are counted per kind (request a code / verify a code).
alter table public.login_attempts add column kind text not null default 'request' check (kind in ('request', 'verify'));

-- "Xem thêm" runs in an Edge Function (150 s limit) under Groq's 8K tokens/minute: 4 items per press.
update public.topics
set settings = jsonb_set(settings, '{more_batch_size}', '4')
where id = 'macro_finance' and (settings->>'more_batch_size')::int > 4;

-- Items appended by "Cập nhật tin mới" (topics.settings.refresh_size, default 6).
update public.topics
set settings = settings || '{"refresh_size": 6}'::jsonb
where id = 'macro_finance' and not settings ? 'refresh_size';

-- Atomically uses one press of a button for today (UTC). Returns false when the daily cap is reached.
create function public.use_action_quota(p_topic_id text, p_action text, p_cap int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  if p_cap <= 0 then
    return false;
  end if;
  insert into public.action_quota (topic_id, action, usage_date, count)
  values (p_topic_id, p_action, current_date, 1)
  on conflict (topic_id, action, usage_date) do update
    set count = public.action_quota.count + 1
    where public.action_quota.count < p_cap
  returning count into v_count;
  return v_count is not null;
end;
$$;
revoke all on function public.use_action_quota(text, text, int) from public, anon, authenticated;
grant execute on function public.use_action_quota(text, text, int) to service_role;

-- Old login attempts are only needed for the last hour of rate limiting.
create index if not exists login_attempts_kind_idx on public.login_attempts (kind, ip_hash, attempted_at desc);
