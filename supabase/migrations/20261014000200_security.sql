-- Access control (docs/DESIGN.md §10).
-- Grants decide which columns a role can touch; RLS decides which rows.
-- anon = public visitor. authenticated = the single admin (signups are disabled),
-- but writes still require is_admin(), which expires 15 days after the last OTP login.

-- ===== Helpers =====

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users
    where id = auth.uid()
      and last_sign_in_at > now() - interval '15 days'
  );
$$;

create function public.is_topic_public(p_topic_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.topics where id = p_topic_id and enabled);
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_topic_public(text) from public;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_topic_public(text) to anon, authenticated;

-- ===== Grants: start from nothing, then open only what is needed =====

revoke all on all tables in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;
-- Tables created by later migrations also start closed; each migration grants explicitly.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;

-- Public read (column subsets)
grant select (id, name_vi, description_vi, position, enabled) on public.topics to anon;
grant select (topic_id, id, name_vi, position, enabled) on public.categories to anon;
grant select (topic_id, id, name, position, enabled) on public.entities to anon;
grant select (topic_id, id, name_vi, enabled) on public.data_modules to anon;
grant select (topic_id, id, name_vi, timezone, local_time, weekdays, enabled) on public.editions to anon;
grant select (topic_id, id, position, label_vi, attach_modules, enabled) on public.digest_slots to anon;
grant select (
  id, topic_id, source_name, url, published_at, category_id, entity_id,
  impact, direction, title_vi, summary_vi, translated_at
) on public.articles to anon;
grant select on public.digests, public.digest_items, public.market_data, public.events to anon;

-- Admin: read everything except login_attempts; write configuration only
grant select on all tables in schema public to authenticated;
revoke select on public.login_attempts from authenticated;
grant insert, update, delete on
  public.topics, public.categories, public.entities, public.sources, public.data_modules,
  public.editions, public.digest_slots, public.ai_providers, public.app_settings
to authenticated;

-- ===== Row level security =====

alter table public.topics enable row level security;
alter table public.categories enable row level security;
alter table public.entities enable row level security;
alter table public.sources enable row level security;
alter table public.data_modules enable row level security;
alter table public.editions enable row level security;
alter table public.digest_slots enable row level security;
alter table public.articles enable row level security;
alter table public.digests enable row level security;
alter table public.digest_items enable row level security;
alter table public.market_data enable row level security;
alter table public.events enable row level security;
alter table public.crawl_runs enable row level security;
alter table public.ai_providers enable row level security;
alter table public.ai_usage enable row level security;
alter table public.action_quota enable row level security;
alter table public.app_settings enable row level security;
alter table public.login_attempts enable row level security;

-- Public read: only enabled things under enabled topics
create policy topics_public_read on public.topics
  for select to anon, authenticated using (enabled);
create policy categories_public_read on public.categories
  for select to anon, authenticated using (enabled and public.is_topic_public(topic_id));
create policy entities_public_read on public.entities
  for select to anon, authenticated using (enabled and public.is_topic_public(topic_id));
create policy data_modules_public_read on public.data_modules
  for select to anon, authenticated using (enabled and public.is_topic_public(topic_id));
create policy editions_public_read on public.editions
  for select to anon, authenticated using (enabled and public.is_topic_public(topic_id));
create policy digest_slots_public_read on public.digest_slots
  for select to anon, authenticated using (enabled and public.is_topic_public(topic_id));
create policy articles_public_read on public.articles
  for select to anon, authenticated using (status = 'translated' and public.is_topic_public(topic_id));
create policy digests_public_read on public.digests
  for select to anon, authenticated using (public.is_topic_public(topic_id));
create policy digest_items_public_read on public.digest_items
  for select to anon, authenticated using (
    exists (select 1 from public.digests d where d.id = digest_id and public.is_topic_public(d.topic_id))
  );
create policy market_data_public_read on public.market_data
  for select to anon, authenticated using (public.is_topic_public(topic_id));
create policy events_public_read on public.events
  for select to anon, authenticated using (public.is_topic_public(topic_id));

-- Admin: full access to configuration
create policy topics_admin on public.topics
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy categories_admin on public.categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy entities_admin on public.entities
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy sources_admin on public.sources
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy data_modules_admin on public.data_modules
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy editions_admin on public.editions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy digest_slots_admin on public.digest_slots
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy ai_providers_admin on public.ai_providers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy app_settings_admin on public.app_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Admin: read-only access to data and operations (writes come from the worker / Edge Functions)
create policy articles_admin_read on public.articles
  for select to authenticated using (public.is_admin());
create policy digests_admin_read on public.digests
  for select to authenticated using (public.is_admin());
create policy digest_items_admin_read on public.digest_items
  for select to authenticated using (public.is_admin());
create policy market_data_admin_read on public.market_data
  for select to authenticated using (public.is_admin());
create policy events_admin_read on public.events
  for select to authenticated using (public.is_admin());
create policy crawl_runs_admin_read on public.crawl_runs
  for select to authenticated using (public.is_admin());
create policy ai_usage_admin_read on public.ai_usage
  for select to authenticated using (public.is_admin());
create policy action_quota_admin_read on public.action_quota
  for select to authenticated using (public.is_admin());

-- login_attempts: no policies → only service_role (Edge Functions) can use it.
