-- Digest quality: category hints for the AI, story keys to avoid repeating one event,
-- longer summaries (~3 minutes of reading per article).

alter table public.categories add column description_en text;

alter table public.articles add column story_key text;
create index articles_story_idx on public.articles (topic_id, story_key);

-- English hints sent to the scoring model; they disambiguate names like "Treasury".
update public.categories c set description_en = v.description
from (values
  ('oil', 'Crude oil prices, OPEC+, supply and demand, refineries, shipping of oil'),
  ('fed', 'U.S. Federal Reserve: rate decisions, FOMC, Fed officials, monetary policy, U.S. inflation data seen through the Fed'),
  ('treasury', 'U.S. Treasury Department actions: Treasury Secretary, sanctions, refunding, debt ceiling, auctions announcements. NOT bond yield moves'),
  ('yield_us', 'U.S. government bond (Treasury) yields and bond market moves'),
  ('yield_jp', 'Japanese government bond (JGB) yields, Bank of Japan policy, yen'),
  ('institution', 'Large asset managers and listed crypto companies: flows, filings, purchases, products'),
  ('geo', 'Wars, conflicts, sanctions, tariffs and geopolitical tensions affecting markets'),
  ('gold', 'Gold prices and central bank gold buying'),
  ('tokenization', 'Tokenization of real-world assets (RWA), tokenized funds, treasuries and stocks'),
  ('crypto', 'Other cryptocurrency market news (Bitcoin, Ethereum, stablecoins, exchanges)'),
  ('other', 'Anything else relevant to global markets')
) as v(id, description)
where c.topic_id = 'macro_finance' and c.id = v.id and c.description_en is null;

-- Target length of an English summary before translation (~3 minutes of reading in Vietnamese).
update public.topics
set settings = settings || '{"summary_words": 350}'::jsonb
where id = 'macro_finance' and not settings ? 'summary_words';
