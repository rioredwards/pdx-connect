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
  -H "Content-Type: application/json" \
  -d '{"url":"https://regrainery.com/"}' | jq
```

