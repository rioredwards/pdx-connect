-- Adds a screenshot URL column to sample_businesses so the partner-finder UI can
-- render a website preview without calling Firecrawl on every page load.
-- Populated out-of-band by `scripts/refresh-sample-screenshots.mjs`.

alter table public.sample_businesses
  add column if not exists screenshot_url text;

comment on column public.sample_businesses.screenshot_url is
  'Public URL of a website screenshot (e.g. captured via Firecrawl). Used by the demo selector tiles.';
