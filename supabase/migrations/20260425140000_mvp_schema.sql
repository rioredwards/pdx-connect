-- MVP schema: profiles, project discovery inputs, offers, targets, analyses.
-- Aligns with FIRECRAWL_MVP_SPEC.md (SourceBusinessProfile, Offer, TargetBusiness, TargetAnalysis).

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  display_name text
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Projects: discovery context + canonical edited source profile (jsonb)
-- ---------------------------------------------------------------------------
alter table public.projects
  add column if not exists user_id uuid references auth.users (id) on delete set null,
  add column if not exists title text,
  add column if not exists search_lat double precision,
  add column if not exists search_lng double precision,
  add column if not exists search_radius_meters integer,
  add column if not exists search_categories text[] not null default '{}',
  add column if not exists partnership_goal text,
  add column if not exists source_profile jsonb;

create index if not exists projects_user_id_idx on public.projects (user_id);

comment on column public.projects.source_profile is
  'User-editable SourceBusinessProfile JSON (merged with scrape extraction).';
comment on column public.projects.partnership_goal is
  'Optional: referrals, bundles, co-marketing, events, etc.';

-- ---------------------------------------------------------------------------
-- Offers (packages / service offerings)
-- ---------------------------------------------------------------------------
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.projects (id) on delete cascade,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  payload jsonb not null
);

create index if not exists offers_project_id_idx on public.offers (project_id);

create unique index if not exists offers_one_primary_per_project
  on public.offers (project_id)
  where is_primary;

drop trigger if exists offers_set_updated_at on public.offers;
create trigger offers_set_updated_at
  before update on public.offers
  for each row execute function public.set_updated_at();

comment on table public.offers is
  'payload holds full Offer object (title, shortPitch, details, deliverables, etc.).';

-- ---------------------------------------------------------------------------
-- Target businesses (hyperlocal discovery)
-- ---------------------------------------------------------------------------
create table if not exists public.target_businesses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_id uuid not null references public.projects (id) on delete cascade,
  provider text not null,
  provider_id text not null,
  name text not null,
  address text,
  city text,
  website_url text,
  phone text,
  distance_meters integer,
  raw_provider jsonb
);

create index if not exists target_businesses_project_id_idx
  on public.target_businesses (project_id);

create unique index if not exists target_businesses_provider_unique
  on public.target_businesses (project_id, provider, provider_id);

comment on column public.target_businesses.provider is
  'places | serpapi | yelp (or other)';

-- ---------------------------------------------------------------------------
-- Scrape runs: source homepage vs per-target Firecrawl runs
-- ---------------------------------------------------------------------------
alter table public.scrape_runs
  add column if not exists kind text not null default 'source',
  add column if not exists target_business_id uuid references public.target_businesses (id) on delete cascade;

create index if not exists scrape_runs_target_business_id_idx
  on public.scrape_runs (target_business_id);

comment on column public.scrape_runs.kind is 'source | target';

-- ---------------------------------------------------------------------------
-- Target analysis (rank, rationale, email draft — structured JSON)
-- ---------------------------------------------------------------------------
create table if not exists public.target_analyses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  target_business_id uuid not null references public.target_businesses (id) on delete cascade,
  scrape_run_id uuid references public.scrape_runs (id) on delete set null,
  status text not null default 'pending',
  rank_1_to_10 smallint,
  payload jsonb not null default '{}'::jsonb,
  constraint target_analyses_rank_range check (
    rank_1_to_10 is null or (rank_1_to_10 >= 1 and rank_1_to_10 <= 10)
  )
);

create unique index if not exists target_analyses_one_per_target
  on public.target_analyses (target_business_id);

create index if not exists target_analyses_rank_idx
  on public.target_analyses (target_business_id, rank_1_to_10 desc nulls last);

drop trigger if exists target_analyses_set_updated_at on public.target_analyses;
create trigger target_analyses_set_updated_at
  before update on public.target_analyses
  for each row execute function public.set_updated_at();

comment on column public.target_analyses.payload is
  'TargetAnalysis JSON: targetProfile, matchReasons, risks, personalizationAnchors, emailDraft.';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.scrape_runs enable row level security;
alter table public.offers enable row level security;
alter table public.target_businesses enable row level security;
alter table public.target_analyses enable row level security;

-- Profiles: each user sees/updates only their row
create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Projects: scoped to owner (rows with user_id null are service-role / demo only)
create policy "projects_select_own"
  on public.projects for select
  using (user_id = auth.uid());

create policy "projects_insert_own"
  on public.projects for insert
  with check (user_id = auth.uid());

create policy "projects_update_own"
  on public.projects for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "projects_delete_own"
  on public.projects for delete
  using (user_id = auth.uid());

-- scrape_runs via project ownership
create policy "scrape_runs_select_own"
  on public.scrape_runs for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = scrape_runs.project_id and p.user_id = auth.uid()
    )
  );

create policy "scrape_runs_insert_own"
  on public.scrape_runs for insert
  with check (
    exists (
      select 1 from public.projects p
      where p.id = scrape_runs.project_id and p.user_id = auth.uid()
    )
  );

create policy "scrape_runs_update_own"
  on public.scrape_runs for update
  using (
    exists (
      select 1 from public.projects p
      where p.id = scrape_runs.project_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = scrape_runs.project_id and p.user_id = auth.uid()
    )
  );

create policy "scrape_runs_delete_own"
  on public.scrape_runs for delete
  using (
    exists (
      select 1 from public.projects p
      where p.id = scrape_runs.project_id and p.user_id = auth.uid()
    )
  );

-- offers
create policy "offers_all_own"
  on public.offers for all
  using (
    exists (
      select 1 from public.projects p
      where p.id = offers.project_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = offers.project_id and p.user_id = auth.uid()
    )
  );

-- target_businesses
create policy "target_businesses_all_own"
  on public.target_businesses for all
  using (
    exists (
      select 1 from public.projects p
      where p.id = target_businesses.project_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = target_businesses.project_id and p.user_id = auth.uid()
    )
  );

-- target_analyses via target -> project
create policy "target_analyses_all_own"
  on public.target_analyses for all
  using (
    exists (
      select 1
      from public.target_businesses t
      join public.projects p on p.id = t.project_id
      where t.id = target_analyses.target_business_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.target_businesses t
      join public.projects p on p.id = t.project_id
      where t.id = target_analyses.target_business_id and p.user_id = auth.uid()
    )
  );
