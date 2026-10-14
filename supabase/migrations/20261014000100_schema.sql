-- Core schema: everything hangs off a topic (docs/DESIGN.md §2, §9).

create type public.article_status as enum (
  'raw', 'filtered_out', 'scored', 'selected', 'summarized', 'translated', 'failed'
);
create type public.source_kind as enum ('rss', 'google_news', 'edgar', 'gdelt', 'html', 'json');
create type public.slot_kind as enum ('category', 'per_category', 'per_entity', 'fill');
create type public.impact_direction as enum ('negative', 'neutral', 'positive');

-- ===== Configuration =====

create table public.topics (
  id text primary key,
  name_vi text not null,
  description_vi text,
  position smallint not null default 0,
  enabled boolean not null default true,
  scoring_guide text not null,
  ai_daily_request_cap int not null default 60 check (ai_daily_request_cap >= 0),
  settings jsonb not null default '{}'
);

create table public.categories (
  topic_id text not null references public.topics on delete cascade,
  id text not null,
  name_vi text not null,
  keywords text[] not null default '{}',
  exclude_keywords text[] not null default '{}',
  position smallint not null default 0,
  enabled boolean not null default true,
  primary key (topic_id, id)
);

create table public.entities (
  topic_id text not null references public.topics on delete cascade,
  id text not null,
  name text not null,
  aliases text[] not null default '{}',
  sec_cik text check (sec_cik ~ '^\d{10}$'),
  position smallint not null default 0,
  enabled boolean not null default true,
  primary key (topic_id, id)
);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  topic_id text not null references public.topics on delete cascade,
  name text not null,
  kind public.source_kind not null,
  url text,
  query text,
  default_category_id text,
  default_entity_id text,
  authority smallint not null default 0,
  enabled boolean not null default true,
  last_fetched_at timestamptz,
  last_error text,
  check (url is not null or query is not null),
  unique (topic_id, name),
  foreign key (topic_id, default_category_id)
    references public.categories (topic_id, id) on delete set null (default_category_id),
  foreign key (topic_id, default_entity_id)
    references public.entities (topic_id, id) on delete set null (default_entity_id)
);

create table public.data_modules (
  topic_id text not null references public.topics on delete cascade,
  id text not null,
  connector text not null,
  name_vi text not null,
  config jsonb not null default '{}',
  enabled boolean not null default true,
  primary key (topic_id, id)
);

create table public.editions (
  topic_id text not null references public.topics on delete cascade,
  id text not null,
  name_vi text not null,
  timezone text not null,
  local_time time not null,
  -- ISO weekdays: 1 = Monday … 7 = Sunday
  weekdays smallint[] not null default '{1,2,3,4,5,6,7}'
    check (weekdays <@ '{1,2,3,4,5,6,7}'::smallint[] and cardinality(weekdays) > 0),
  size_min smallint not null check (size_min > 0),
  size_max smallint not null,
  run_modules boolean not null default true,
  enabled boolean not null default true,
  primary key (topic_id, id),
  check (size_max >= size_min)
);

create table public.digest_slots (
  topic_id text not null references public.topics on delete cascade,
  id text not null,
  position smallint not null,
  label_vi text not null,
  kind public.slot_kind not null,
  category_ids text[] not null default '{}',
  entity_ids text[] not null default '{}',
  min_items smallint not null default 0 check (min_items >= 0),
  max_items smallint not null default 1,
  min_score int not null default 0,
  -- score required for every item after the first one in this slot (null = same as min_score)
  extra_item_min_score int,
  attach_modules text[] not null default '{}',
  enabled boolean not null default true,
  primary key (topic_id, id),
  check (max_items >= min_items)
);

-- ===== Data =====

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  topic_id text not null references public.topics on delete cascade,
  source_id uuid references public.sources on delete set null,
  source_name text not null,
  url text not null,
  url_hash text not null,
  cluster_key text,
  title text not null,
  description text,
  content_snippet text,
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  status public.article_status not null default 'raw',
  category_id text,
  entity_id text,
  impact smallint check (impact between 0 and 10),
  direction public.impact_direction,
  explains text,
  ai_reason text,
  source_count int not null default 1 check (source_count >= 1),
  final_score int,
  summary_en text,
  title_vi text,
  summary_vi text,
  translated_at timestamptz,
  error text,
  unique (topic_id, url_hash),
  foreign key (topic_id, category_id)
    references public.categories (topic_id, id) on delete set null (category_id),
  foreign key (topic_id, entity_id)
    references public.entities (topic_id, id) on delete set null (entity_id)
);
create index articles_status_score_idx on public.articles (topic_id, status, final_score desc);
create index articles_published_idx on public.articles (topic_id, published_at desc);
create index articles_cluster_idx on public.articles (topic_id, cluster_key);

create table public.digests (
  id uuid primary key default gen_random_uuid(),
  topic_id text not null,
  edition_id text not null,
  digest_date date not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (topic_id, edition_id) references public.editions on delete cascade,
  unique (topic_id, edition_id, digest_date),
  check (window_end > window_start)
);

create table public.digest_items (
  digest_id uuid not null references public.digests on delete cascade,
  article_id uuid not null references public.articles on delete cascade,
  position smallint not null,
  slot_id text,
  is_pinned boolean not null default false,
  added_by text not null default 'auto' check (added_by in ('auto', 'more')),
  primary key (digest_id, article_id)
);
create index digest_items_article_idx on public.digest_items (article_id);

create table public.market_data (
  topic_id text not null,
  module_id text not null,
  series text not null,
  obs_date date not null,
  value numeric not null,
  source text not null,
  foreign key (topic_id, module_id) references public.data_modules on delete cascade,
  primary key (topic_id, series, obs_date)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  topic_id text not null,
  module_id text not null,
  kind text not null,
  title text not null,
  title_vi text,
  starts_at timestamptz not null,
  importance smallint not null default 2 check (importance between 1 and 3),
  source_url text,
  foreign key (topic_id, module_id) references public.data_modules on delete cascade,
  unique (topic_id, kind, starts_at, title)
);
create index events_starts_idx on public.events (topic_id, starts_at);

-- ===== Operations =====

create table public.crawl_runs (
  id uuid primary key default gen_random_uuid(),
  topic_id text not null references public.topics on delete cascade,
  edition_id text,
  trigger text not null check (trigger in ('schedule', 'manual', 'backup')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  stats jsonb not null default '{}',
  error text
);
create index crawl_runs_topic_idx on public.crawl_runs (topic_id, started_at desc);

create table public.ai_providers (
  id text primary key,
  role text not null check (role in ('extract', 'translate')),
  provider text not null,
  model text not null,
  priority smallint not null,
  daily_request_limit int not null check (daily_request_limit >= 0),
  rpm_limit int not null check (rpm_limit > 0),
  enabled boolean not null default true
);

create table public.ai_usage (
  provider_id text not null references public.ai_providers on delete cascade,
  topic_id text not null references public.topics on delete cascade,
  usage_date date not null,
  requests int not null default 0,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  primary key (provider_id, topic_id, usage_date)
);

create table public.action_quota (
  topic_id text not null references public.topics on delete cascade,
  action text not null check (action in ('more', 'refresh')),
  usage_date date not null,
  count int not null default 0,
  primary key (topic_id, action, usage_date)
);

create table public.app_settings (
  key text primary key,
  value jsonb not null
);

create table public.login_attempts (
  ip_hash text not null,
  attempted_at timestamptz not null default now()
);
create index login_attempts_ip_idx on public.login_attempts (ip_hash, attempted_at desc);
