-- Phase 2 (collect): duplicate status, per-article authority, prefix keywords.

-- Same story already stored from another source: kept only so its URL is not fetched again.
alter type public.article_status add value if not exists 'duplicate' after 'filtered_out';

-- Authority of the original publisher (Google News items resolve it per domain at fetch time).
alter table public.articles add column authority smallint not null default 0;

-- Keywords ending with "*" match as a prefix ("tokeniz*" matches tokenize, tokenized, tokenization).
update public.categories
set keywords = array_replace(keywords, 'tokeniz', 'tokeniz*')
where topic_id = 'macro_finance' and id = 'tokenization';

-- Topic-wide exclusions (price pages and similar noise), editable in topics.settings.
update public.topics
set settings = settings || jsonb_build_object('exclude_keywords', jsonb_build_array(
  'price today', 'live price', 'price prediction*', 'price chart', 'price analysis',
  'price forecast*', 'current price of', 'how to buy', 'marketcap'
))
where id = 'macro_finance' and not settings ? 'exclude_keywords';
