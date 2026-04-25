-- Minimal schema for hackathon workflow

create extension if not exists "pgcrypto";

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source_url text not null,
  source_name text null,
  status text not null default 'created'
);

create table if not exists public.scrape_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  input_url text not null,
  firecrawl_response jsonb null,
  extracted_profile jsonb null,
  model text null,
  status text not null default 'queued',
  error text null
);

create index if not exists scrape_runs_project_id_idx on public.scrape_runs(project_id);

