## pdx-connect (hackathon MVP)

This repo contains a Firecrawl + OpenAI (GPT‑5.5) workflow for:
- scraping a small business website,
- extracting a structured profile (JSON),
- (next) generating partnership packages + drafting outreach.

### Backend
We use **Supabase** for Postgres + Edge Functions.

### What’s included (so far)
- Spec: `FIRECRAWL_MVP_SPEC.md`
- Test sites: `test-cases/websites.json`
- Supabase:
  - migrations in `supabase/migrations/`
  - edge function `supabase/functions/scrape_analyze/`

### Run locally (quick)
Prereqs: Supabase CLI installed and **Docker running** (Docker Desktop or Colima).

1) Start Supabase:

```bash
supabase start
```

If you see “Cannot connect to the Docker daemon…”, start Docker/Colima and retry.

2) Set env for functions:
- Copy `supabase/.env.example` → `supabase/.env.local` and fill in keys.

3) Serve the edge function:

```bash
supabase functions serve scrape_analyze --env-file supabase/.env.local
```

4) Invoke it:

```bash
curl -sS -X POST "http://localhost:54321/functions/v1/scrape_analyze" \
  -H "Authorization: Bearer $FUNCTION_AUTH_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://regrainery.com/"}' | jq
```

### Web app (Next.js) + Vercel
This repo includes a `web/` Next.js (App Router) app intended to be hosted on Vercel.

- Vercel project settings (important):
  - Set the Vercel **Root Directory** to `web` (so it picks up `web/package.json` and Next config).
  - The `web/vercel.json` file pins install/build commands for deterministic deploys.
  - Node is pinned via `web/package.json` `engines` + `web/.nvmrc` (Vercel reads these).

- Local dev:

```bash
cd web
npm install
cp .env.example .env.local
npm run dev
```

- Vercel project settings (Production/Preview):
  - `SCRAPE_ANALYZE_URL` = your deployed Supabase function URL, e.g. `https://<project-ref>.supabase.co/functions/v1/scrape_analyze`
  - `SCRAPE_ANALYZE_SECRET` = same value as Supabase `FUNCTION_AUTH_SECRET` (set as a Supabase function secret)

In Supabase, set a function secret:

- `FUNCTION_AUTH_SECRET` = same string as Vercel `SCRAPE_ANALYZE_SECRET`

Then deploy the function (example):

```bash
supabase functions deploy scrape_analyze
```

