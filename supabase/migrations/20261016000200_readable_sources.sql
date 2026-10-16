-- Readable, reputable outlets (verified 2026-10-16: pages open without paywall), so digest slots
-- are not filled by low-quality sites when Reuters/WSJ/Bloomberg cannot be read.

insert into public.sources (topic_id, name, kind, url, default_category_id, authority) values
  ('macro_finance', 'CNBC Economy', 'rss', 'https://www.cnbc.com/id/20910258/device/rss/rss.html', 'fed', 3),
  ('macro_finance', 'CNBC Markets', 'rss', 'https://www.cnbc.com/id/15839069/device/rss/rss.html', null, 3),
  ('macro_finance', 'OilPrice.com', 'rss', 'https://oilprice.com/rss/main', 'oil', 3),
  ('macro_finance', 'Decrypt', 'rss', 'https://decrypt.co/feed', 'crypto', 3)
on conflict do nothing;

-- Existing crypto outlets get the same "readable, reputable" bonus (only if still at the default 0).
update public.sources set authority = 3
where topic_id = 'macro_finance' and name in ('CoinDesk', 'The Block', 'Cointelegraph') and authority = 0;
