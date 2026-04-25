# pdx-connect: Hackathon / MVP agent instructions

## What this is

**Firecrawl-first** hyperlocal partner discovery: small-business URL + area → **source profile** → **offers** → **nearby targets** → **per-target analysis** (rank 1–10, email draft). Product contract, data model, and acceptance: **`FIRECRAWL_MVP_SPEC.md`**.

Ship the demo fast; not a platform.

**Time box:** assume a **~1 hour** build window unless the user says otherwise. Prefer getting the spec happy path and demo working over polish, refactors, or process. After the path works, one short verification pass (see `close-loop-engineering` skill) is enough. Skip optional review skills and extra docs during the sprint.

**Collaborators (no `~/.agents`):** global defaults in **`GLOBAL-AGENTS.md`**, general dev in **`.cursor/roles/general-dev/AGENTS.md`**. This file wins on conflicts.

**Project skills (`.cursor/skills/…/SKILL.md` when the task matches):**

| Path | Use when |
|------|----------|
| `close-loop-engineering` | “Close the loop”, ship safely, or validate non-trivial work (lint, typecheck, test, build, smoke) |
| `frontend-design` | Distinctive UI direction, typography, motion, and layout (avoid generic AI aesthetics) |
| `tailwind` | Tailwind v4, `globals.css`, `@theme`, utilities and `cn()` in `web/` |
| `shadcn` | shadcn/ui CLI, `components.json`, primitives under `web/components/ui` |
| `nextjs` | App Router, RSC, Actions, `next.config`, routing |
| `vercel-functions` | Route Handlers, runtimes, limits |
| `env-vars` | `vercel env`, `.env.local`, `NEXT_PUBLIC_` |
| `deployments-cicd` | Vercel CLI, CI, previews |
| `routing-middleware` | `middleware`, rewrites, proxies |

Authoritative platform docs: [Next.js](https://nextjs.org/docs), [Vercel](https://vercel.com/docs). Optional review skills: see `GLOBAL-AGENTS.md`. Reusable prompts: **`.cursor/commands/`**.

---

## How assistants work here

- **Tight answers:** bullets, headings, code. No filler or repeat summaries unless asked.
- **Speed over perfection** unless the spec blocks it. Favor the smallest change that satisfies acceptance; defer nice-to-haves, broad typing cleanups, and “while we are here” edits.
- **Sprint depriorities:** new markdown files, code health or deep review skills, and repeated close-loop runs on every tiny change. If stuck after two attempts on one issue, switch approach or ask the user (see general-dev role). Do not spend the hour looping on the same fix.
- **Spec is law** for product behavior. Do not add features that break non-goals (no auto-send, no production-scale crawl).
- **Types:** `SourceBusinessProfile`, `Offer`, `TargetBusiness`, `TargetAnalysis`, `Citation` in UI and API shapes.
- **One obvious home** per concern (one small client module, one request/response type set; no extra layers).
- **No drive-by refactors** or new docs files unless asked.
- **Secrets:** Firecrawl, OpenAI, places providers, and **`SUPABASE_SERVICE_ROLE_KEY`** (if used) are **server-only** (no `NEXT_PUBLIC_`). `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are public by design (see Supabase docs). Call server-side APIs from **Route Handlers** (`app/api/.../route.ts`) or **Server Actions** so private keys never reach the browser.

---

## Product and stack (MVP)

**Flow:** linear wizard: inputs → editable profile (with citations) → offers (pick primary) → target list (multi-select) → per-target rank, rationale, email draft, **CSV export**. Optional thin “run status” if the pipeline feels stuck. Step-level detail: spec.

**Stack (implementation, this repo):** Next.js App Router + TypeScript under `app/`. **Client** components for the wizard; **server** for secrets. Same-origin `fetch` to `/api/...` only. **UI: [shadcn/ui](https://ui.shadcn.com/)** (Tailwind CSS). Add components with the CLI (e.g. `npx shadcn@latest add button`); do not hand-roll primitive controls when a shadcn pattern fits. **Validation: [Zod](https://zod.dev/)** for API request/response bodies, env parsing as needed, and (where helpful) **LLM** JSON before mapping to spec types. Forms: controlled, or **React Hook Form** with shadcn form primitives and **`@hookform/resolvers/zod`** when validation grows. State: React / `useReducer` or a small store if needed. **TanStack Query** only if several parallel client queries justify it. **No** separate Vite app, **no** Redux for MVP. Types in one `types/` (or `src/types.ts`) aligned with the spec; **prefer Zod schemas as the source of truth** and infer types with `z.infer` where practical. **A11y:** semantic HTML and labels; shadcn is Radix-based; no full WCAG pass unless asked.

**External services (see `FIRECRAWL_MVP_SPEC.md` for product detail):** **Firecrawl** for scrape and bounded crawl. **OpenAI** for all understanding, structured extraction, rank, and drafts; use the model the spec names (e.g. **GPT-5.5**) and **structured JSON** for determinism, unless the user points to a different model. **Hyperlocal business discovery** uses **one** of Google Places, SerpApi, or Yelp in the first pass, not multiple providers at once, unless the user explicitly widens scope.

**Data and auth: [Supabase](https://supabase.com/docs)** (Postgres; optional Realtime later). **Auth: [Supabase Auth](https://supabase.com/docs/guides/auth)** only. Do not build a parallel auth stack. Wire Next.js with the official **App Router + `@supabase/ssr`** flow (server client, browser client, middleware, cookies as in Supabase’s Next.js guide). Use **Row Level Security** for per-user or sensitive rows. The **anon key** is safe in the client; the **service role** key bypasses RLS and stays server-only (Route Handlers, Server Actions, or other trusted server code).

**Bootstrapping UI:** after `create-next-app` (or equivalent), run `npx shadcn@latest init` in the repo (App Router, TypeScript, Tailwind, `components.json` defaults). New UI should use shadcn building blocks in `components/ui/` and local wrappers in `components/` as needed.

**Explicitly skip for MVP:** custom home-grown auth, billing, sending mail as a product feature (draft emails only), background-job UI past “processing…”, real-time collab, heavy caching, E2E suites in the first pass (manual path = acceptance in the spec).

---

## Definition of “done” (frontend-leaning)

- Happy path through profile → offers → targets → per-target result with rank and draft.
- **CSV export** for the selected batch.
- Env documented in `.env.example` (public Supabase URL + anon key; all private keys and `service_role` server-only; same for Firecrawl, OpenAI, places providers).
- **Before calling it done** (or after a non-trivial chunk): run **`.cursor/skills/close-loop-engineering/SKILL.md`**. For the 1h sprint, run it once the happy path is in place, not after every file touch.

If unsure, re-read the **Acceptance criteria** in `FIRECRAWL_MVP_SPEC.md`.
