-- Curated Portland demo businesses: quick-pick list for AI scrape / discovery flows.
-- Readable by anyone with the anon key (reference data; no PII beyond public URLs).

create table if not exists public.sample_businesses (
  id text primary key,
  sort_order integer not null,
  name text not null,
  website_url text not null,
  discover_title text not null,
  blurb text
);

comment on table public.sample_businesses is
  'Portland metro B2B / pro–services samples for quick-select; pairs with discover_targets (title + source context).';

create index if not exists sample_businesses_sort_idx on public.sample_businesses (sort_order);

-- Seed: B2B-oriented Portland / metro (trade, pro services, engineering, AEC, industrial).
-- The Regrainery is the existing scrape test case; others are real firms with public sites.
insert into public.sample_businesses (id, sort_order, name, website_url, discover_title, blurb) values
  (
    'regrainery',
    1,
    'The Regrainery',
    'https://regrainery.com/',
    'The Regrainery — local partners',
    'Trade fabrication, commercial woodwork'
  ),
  (
    'ziba',
    2,
    'Ziba Design',
    'https://ziba.com/',
    'Ziba Design — local partners',
    'B2B product, service & brand work'
  ),
  (
    'holst',
    3,
    'Holst Architecture',
    'https://www.holstarch.com/',
    'Holst Architecture — local partners',
    'Civic, workplace, commercial AEC'
  ),
  (
    'ankrom',
    4,
    'Ankrom Moisan',
    'https://ankrom.com/',
    'Ankrom Moisan — local partners',
    'Workplace, multifamily, interiors'
  ),
  (
    'kpff',
    5,
    'KPFF',
    'https://www.kpff.com/',
    'KPFF — local partners',
    'Structural & civil engineering'
  ),
  (
    'metaltoad',
    6,
    'Metal Toad',
    'https://www.metaltoad.com/',
    'Metal Toad — local partners',
    'Cloud & app delivery for orgs'
  ),
  (
    'stoel',
    7,
    'Stoel Rives',
    'https://www.stoel.com/',
    'Stoel Rives — local partners',
    'Business, IP & corporate law'
  ),
  (
    'bora',
    8,
    'BORA',
    'https://www.borarch.com/',
    'BORA — local partners',
    'Labs, higher-ed, workplace design'
  ),
  (
    'mfa',
    9,
    'Maul Foster Alongi',
    'https://maulfosteralongi.com/',
    'Maul Foster Alongi — local partners',
    'Env planning, land use, agency'
  ),
  (
    'esco',
    10,
    'Weir ESCO (ESCO)',
    'https://www.escorp.com/',
    'Weir ESCO — local partners',
    'Engineered wear, mining, infrastructure'
  )
on conflict (id) do update set
  sort_order = excluded.sort_order,
  name = excluded.name,
  website_url = excluded.website_url,
  discover_title = excluded.discover_title,
  blurb = excluded.blurb;

alter table public.sample_businesses enable row level security;

create policy "sample_businesses_select_public"
  on public.sample_businesses for select
  to anon, authenticated
  using (true);

grant select on public.sample_businesses to anon, authenticated, service_role;
