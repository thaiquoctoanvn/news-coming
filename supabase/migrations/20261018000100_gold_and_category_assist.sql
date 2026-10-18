-- Gold price chart and the AI helper for category keywords (docs/DESIGN.md §7.2, §11).

-- Gold: COMEX front-month futures (GC=F) from the same Yahoo chart connector as oil.
-- The first run fetches one year of daily closes because the module has no data yet.
insert into public.data_modules (topic_id, id, connector, name_vi, config) values
  ('macro_finance', 'gold_price', 'yahoo_chart', 'Giá vàng', '{"series": {"GOLD": "GC=F"}}')
on conflict do nothing;

-- "AI gợi ý" on the config page uses its own daily press limit, so it never eats the pipeline's AI budget.
alter table public.action_quota drop constraint if exists action_quota_action_check;
alter table public.action_quota add constraint action_quota_action_check check (action in ('more', 'refresh', 'assist'));

update public.topics
set settings = settings || '{"daily_cap_assist": 10}'::jsonb
where id = 'macro_finance' and not settings ? 'daily_cap_assist';
