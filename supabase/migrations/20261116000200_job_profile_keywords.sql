-- Search keywords per job profile. A scan looks for every enabled profile's keywords on each site,
-- and a profile only scores postings whose title contains one of its own keywords.

-- Existing profiles keep the scope used so far.
alter table public.job_profiles add column keywords text[] not null default '{android,mobile}';
-- A new profile must say what it looks for.
alter table public.job_profiles alter column keywords drop default;

-- 1 to 5 keywords of 2 to 40 characters each, without "|" or line breaks.
alter table public.job_profiles add constraint job_profiles_keywords_check check (
  array_position(keywords, null) is null
  and array_to_string(keywords, '|') ~ '^[^|[:cntrl:]]{2,40}(\|[^|[:cntrl:]]{2,40}){0,4}$'
);
