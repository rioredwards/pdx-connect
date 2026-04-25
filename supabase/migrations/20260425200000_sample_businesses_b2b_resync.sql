-- Drop consumer-retail seed rows if an older migration already ran; align DB with B2B set.

delete from public.sample_businesses
where id in (
  'stumptown',
  'powells',
  'salt-and-straw',
  'tusk',
  'nongs',
  'screendoor',
  'hopworks',
  'voodoo',
  'le-pigeon'
);

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
