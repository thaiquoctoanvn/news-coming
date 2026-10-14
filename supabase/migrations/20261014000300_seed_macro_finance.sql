-- Seed: topic "Vĩ mô / Tài chính" (docs/DESIGN.md §2.3, §5, §7).
-- Every insert uses "on conflict do nothing" so redeploys never overwrite config edited on the web.
-- Source URLs verified with apps/worker/scripts/verify-sources.ts on 2026-10-14.

insert into public.topics (id, name_vi, description_vi, position, scoring_guide, ai_daily_request_cap, settings)
values (
  'macro_finance',
  'Vĩ mô / Tài chính',
  'Dầu, FED, lợi suất trái phiếu Mỹ/Nhật, các tổ chức tài chính và crypto lớn, địa chính trị, vàng.',
  0,
  $guide$Score "impact" 0-10 = expected effect on global financial markets (rates, oil, equities, crypto, gold).
9-10: emergency Fed rate move; conflict that disrupts oil supply (e.g. Strait of Hormuz); major exchange hacked or insolvent; Strategy forced to sell BTC; shock spike in JGB yields.
7-8: FOMC decision; CPI/NFP far from consensus; OPEC+ output change; major ETF approved or rejected.
4-6: Fed officials' speeches; institutional buys/sells; Treasury auction results.
0-3: commentary, forecasts, PR, opinion pieces.
"direction" = likely effect on risk assets (negative / neutral / positive).$guide$,
  60,
  '{
    "pin": {"min_impact": 9, "direction": "negative", "max": 3},
    "more_batch_size": 8,
    "daily_cap_more": 5,
    "daily_cap_refresh": 3,
    "retention": {"snippet_days": 30, "filtered_out_days": 7}
  }'
)
on conflict do nothing;

insert into public.categories (topic_id, id, name_vi, position, keywords, exclude_keywords) values
  ('macro_finance', 'oil', 'Dầu', 1,
    '{oil,crude,brent,wti,opec,petroleum,barrel,refinery}', '{"olive oil","essential oil","cooking oil"}'),
  ('macro_finance', 'fed', 'FED', 2,
    '{"federal reserve",fed,fomc,powell,"rate cut","rate hike","interest rate","monetary policy","beige book"}', '{}'),
  ('macro_finance', 'treasury', 'Bộ Tài chính Mỹ', 3,
    '{"treasury department","treasury secretary",bessent,refunding,"debt ceiling","treasury auction"}', '{}'),
  ('macro_finance', 'yield_us', 'Lợi suất Mỹ', 4,
    '{"treasury yield","10-year","2-year","30-year","bond yield",t-bill,"bond market"}', '{}'),
  ('macro_finance', 'yield_jp', 'Lợi suất Nhật', 5,
    '{jgb,"bank of japan",boj,ueda,"japanese government bond",yen}', '{}'),
  ('macro_finance', 'institution', 'Tổ chức', 6,
    '{etf,13f,inflows,outflows,"asset manager","fund"}', '{}'),
  ('macro_finance', 'geo', 'Địa chính trị', 7,
    '{war,missile,sanctions,attack,ceasefire,invasion,conflict,hormuz,iran,israel,russia,ukraine,taiwan,tariff}', '{}'),
  ('macro_finance', 'gold', 'Vàng', 8,
    '{gold,bullion,"precious metal","central bank gold"}', '{"gold medal","golden globe","golden state"}'),
  ('macro_finance', 'tokenization', 'Token hóa tài sản', 9,
    '{tokeniz,tokenized,rwa,"real-world asset","onchain treasury",buidl}', '{}'),
  ('macro_finance', 'crypto', 'Crypto khác', 10,
    '{bitcoin,btc,ether,ethereum,crypto,stablecoin}', '{}'),
  ('macro_finance', 'other', 'Khác', 11, '{}', '{}')
on conflict do nothing;

insert into public.entities (topic_id, id, name, aliases, sec_cik, position, enabled) values
  ('macro_finance', 'strategy', 'Strategy', '{"Strategy Inc",MicroStrategy,MSTR,Saylor}', '0001050446', 1, true),
  ('macro_finance', 'bitmine', 'BitMine', '{BitMine,BMNR,"Tom Lee"}', '0001829311', 2, true),
  ('macro_finance', 'coinbase', 'Coinbase', '{Coinbase,"Brian Armstrong"}', '0001679788', 3, true),
  ('macro_finance', 'circle', 'Circle', '{"Circle Internet",CRCL,USDC,"Jeremy Allaire"}', '0001876042', 4, true),
  ('macro_finance', 'blackrock', 'BlackRock', '{BlackRock,IBIT,BUIDL,"Larry Fink"}', '0002012383', 5, true),
  ('macro_finance', 'vanguard', 'Vanguard', '{Vanguard}', null, 6, false),
  ('macro_finance', 'grayscale', 'Grayscale', '{Grayscale,GBTC}', null, 7, false),
  ('macro_finance', 'binance', 'Binance', '{Binance,BNB,"Richard Teng"}', null, 8, false)
on conflict do nothing;

-- Official sources
insert into public.sources (topic_id, name, kind, url, default_category_id, default_entity_id, authority) values
  ('macro_finance', 'Fed press (all)', 'rss', 'https://www.federalreserve.gov/feeds/press_all.xml', 'fed', null, 10),
  ('macro_finance', 'Fed press (monetary)', 'rss', 'https://www.federalreserve.gov/feeds/press_monetary.xml', 'fed', null, 10),
  ('macro_finance', 'Fed speeches', 'rss', 'https://www.federalreserve.gov/feeds/speeches.xml', 'fed', null, 10),
  ('macro_finance', 'Treasury press releases', 'html', 'https://home.treasury.gov/news/press-releases', 'treasury', null, 10),
  ('macro_finance', 'BOJ what''s new', 'rss', 'https://www.boj.or.jp/en/rss/whatsnew.xml', 'yield_jp', null, 10),
  ('macro_finance', 'EDGAR: Strategy', 'edgar', 'https://data.sec.gov/submissions/CIK0001050446.json', 'institution', 'strategy', 10),
  ('macro_finance', 'EDGAR: BitMine', 'edgar', 'https://data.sec.gov/submissions/CIK0001829311.json', 'institution', 'bitmine', 10),
  ('macro_finance', 'EDGAR: Coinbase', 'edgar', 'https://data.sec.gov/submissions/CIK0001679788.json', 'institution', 'coinbase', 10),
  ('macro_finance', 'EDGAR: Circle', 'edgar', 'https://data.sec.gov/submissions/CIK0001876042.json', 'institution', 'circle', 10),
  ('macro_finance', 'EDGAR: BlackRock', 'edgar', 'https://data.sec.gov/submissions/CIK0002012383.json', 'institution', 'blackrock', 10)
on conflict do nothing;

-- Media and aggregators
insert into public.sources (topic_id, name, kind, url, default_category_id, authority) values
  ('macro_finance', 'CoinDesk', 'rss', 'https://www.coindesk.com/arc/outboundfeeds/rss/', 'crypto', 0),
  ('macro_finance', 'The Block', 'rss', 'https://www.theblock.co/rss.xml', 'crypto', 0),
  ('macro_finance', 'Cointelegraph', 'rss', 'https://cointelegraph.com/rss', 'crypto', 0),
  ('macro_finance', 'Binance announcements', 'json',
    'https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&pageNo=1&pageSize=20', 'crypto', 5)
on conflict do nothing;

-- Google News queries (authority is resolved per original domain at fetch time)
insert into public.sources (topic_id, name, kind, query, default_category_id, default_entity_id) values
  ('macro_finance', 'Google News: oil', 'google_news', 'oil prices OR brent OR WTI OR OPEC', 'oil', null),
  ('macro_finance', 'Google News: Fed', 'google_news', '"Federal Reserve" OR FOMC OR Powell', 'fed', null),
  ('macro_finance', 'Google News: US yields', 'google_news', '"Treasury yields" OR "10-year yield"', 'yield_us', null),
  ('macro_finance', 'Google News: JGB', 'google_news', '"JGB yields" OR "Bank of Japan"', 'yield_jp', null),
  ('macro_finance', 'Google News: Strategy', 'google_news', '"Strategy" MSTR bitcoin', 'institution', 'strategy'),
  ('macro_finance', 'Google News: BitMine', 'google_news', 'BitMine BMNR', 'institution', 'bitmine'),
  ('macro_finance', 'Google News: Coinbase', 'google_news', 'Coinbase', 'institution', 'coinbase'),
  ('macro_finance', 'Google News: Circle', 'google_news', '"Circle" USDC', 'institution', 'circle'),
  ('macro_finance', 'Google News: BlackRock', 'google_news', 'BlackRock (bitcoin OR ETF OR tokenized)', 'institution', 'blackrock'),
  ('macro_finance', 'Google News: geopolitics', 'google_news', 'war OR sanctions OR geopolitical tensions markets', 'geo', null),
  ('macro_finance', 'Google News: gold', 'google_news', 'gold prices OR "central bank gold"', 'gold', null),
  ('macro_finance', 'Google News: tokenization', 'google_news', 'tokenization OR "tokenized treasuries" OR RWA', 'tokenization', null)
on conflict do nothing;

-- GDELT: 1 request / 5 s per IP and frequent 429s → off by default, Google News covers geopolitics.
insert into public.sources (topic_id, name, kind, query, default_category_id, enabled) values
  ('macro_finance', 'GDELT: geopolitics', 'gdelt', '(war OR sanctions OR "oil supply") sourcelang:english', 'geo', false)
on conflict do nothing;

insert into public.data_modules (topic_id, id, connector, name_vi, config) values
  ('macro_finance', 'oil_price', 'yahoo_chart', 'Giá dầu',
    '{"series": {"WTI": "CL=F", "BRENT": "BZ=F"},
      "fallback": {"connector": "eia", "series": {"WTI": "RWTC", "BRENT": "RBRTE"}}}'),
  ('macro_finance', 'us_yields', 'treasury_yield_curve', 'Lợi suất Mỹ',
    '{"series": {"US2Y": "BC_2YEAR", "US10Y": "BC_10YEAR", "US30Y": "BC_30YEAR"},
      "fallback": {"connector": "fred", "series": {"US2Y": "DGS2", "US10Y": "DGS10", "US30Y": "DGS30"}}}'),
  ('macro_finance', 'jp_yields', 'mof_jgb', 'Lợi suất Nhật',
    '{"series": {"JP10Y": "10Y", "JP30Y": "30Y"}}'),
  ('macro_finance', 'macro_calendar', 'macro_calendar', 'Lịch sự kiện vĩ mô',
    '{"feeds": ["fomc", "bls", "bea", "treasury_auctions", "boj"]}')
on conflict do nothing;

insert into public.editions (topic_id, id, name_vi, timezone, local_time, weekdays, size_min, size_max) values
  ('macro_finance', 'morning', 'Bản tin sáng', 'Asia/Ho_Chi_Minh', '06:00', '{1,2,3,4,5,6,7}', 10, 12),
  ('macro_finance', 'pre_us', 'Trước phiên Mỹ', 'America/New_York', '08:45', '{1,2,3,4,5}', 6, 8)
on conflict do nothing;

insert into public.digest_slots
  (topic_id, id, position, label_vi, kind, category_ids, entity_ids, min_items, max_items, min_score, extra_item_min_score, attach_modules)
values
  ('macro_finance', 'oil', 1, 'Giá dầu', 'category', '{oil}', '{}', 0, 1, 40, null, '{oil_price}'),
  ('macro_finance', 'fed', 2, 'FED', 'category', '{fed}', '{}', 0, 2, 40, 70, '{}'),
  ('macro_finance', 'yields', 3, 'Lợi suất Mỹ + Nhật', 'category', '{yield_us,yield_jp}', '{}', 0, 1, 40, null, '{us_yields,jp_yields}'),
  ('macro_finance', 'institutions', 4, 'Tổ chức', 'per_entity', '{}', '{strategy,bitmine,coinbase,circle,blackrock}', 0, 5, 35, null, '{}'),
  ('macro_finance', 'geo_gold', 5, 'Địa chính trị + Vàng', 'per_category', '{geo,gold}', '{}', 0, 2, 45, null, '{}'),
  ('macro_finance', 'rest', 6, 'Tin khác', 'fill', '{}', '{}', 0, 12, 50, null, '{}')
on conflict do nothing;
