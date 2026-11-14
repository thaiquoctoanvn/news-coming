-- Several scoring profiles for the job board. Each profile has a required title and its own scores
-- and daily report; the postings themselves (jobs) are shared by all profiles.

-- ===== Tables =====

create table public.job_profiles (
  id uuid primary key default gen_random_uuid(),
  -- Shown on the job page to pick a profile.
  title text not null check (length(btrim(title)) between 1 and 80),
  -- Skills and experience sent to the AI when scoring. No personal data (the admin page says so).
  profile_text text not null check (length(profile_text) <= 4000),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.job_scores (
  job_id uuid not null references public.jobs on delete cascade,
  profile_id uuid not null references public.job_profiles on delete cascade,
  score smallint not null check (score between 1 and 10),
  reason text not null,
  tip text,
  tier text check (tier in ('top', 'fit', 'maybe', 'low', 'unverified')),
  -- The day (Vietnam time) the job appears in this profile's report.
  report_date date not null,
  primary key (job_id, profile_id)
);
create index job_scores_report_idx on public.job_scores (profile_id, report_date desc);

-- ===== Move the single profile and its scores =====

-- The profile saved so far (app_settings.job_profile) becomes the first profile; without one, the
-- generic profile the worker used until now.
insert into public.job_profiles (title, profile_text)
select 'Hồ sơ chính', coalesce(
  (select btrim(value->>'text') from public.app_settings where key = 'job_profile' and btrim(value->>'text') <> ''),
  'Android developer (Kotlin, Java), mid to senior level, looking for Android or mobile roles.'
);

insert into public.job_scores (job_id, profile_id, score, reason, tip, tier, report_date)
select j.id, p.id, j.score, coalesce(j.reason, ''), j.tip, j.tier, j.report_date
from public.jobs j cross join public.job_profiles p
where j.score is not null and j.report_date is not null;

delete from public.app_settings where key = 'job_profile';

-- jobs.report_date stays: the last day the job was reported to any profile (used by the purge).
alter table public.jobs drop column score, drop column reason, drop column tip, drop column tier;
create index jobs_report_idx on public.jobs (report_date desc);

-- ===== Access: admin manages profiles and reads scores; worker writes; the public gets nothing =====

alter table public.job_profiles enable row level security;
alter table public.job_scores enable row level security;

grant all on public.job_profiles, public.job_scores to service_role;
grant select, insert, update, delete on public.job_profiles to authenticated;
grant select on public.job_scores to authenticated;

create policy job_profiles_admin on public.job_profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy job_scores_admin_read on public.job_scores
  for select to authenticated using (public.is_admin());
