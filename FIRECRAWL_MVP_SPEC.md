# Firecrawl-first Hackathon MVP Spec: Hyperlocal Partner Discovery + Outreach Drafts

## One-liner
User enters their small-business website URL → we **scrape + summarize it into a structured business profile** → user edits **offers** → we **discover nearby complementary businesses** → we **scrape/analyze each target** → we generate a **personalized outreach email draft** + an **AI rank (1–10)** per target.

## Goals (MVP)
- **Functional demo** end-to-end in minutes (not a production crawler).
- Minimal custom scraping infra by using **Firecrawl** for:
  - Clean **markdown extraction** from pages
  - Optional **domain crawl** (bounded)
  - (Optional) lightweight **search** features if needed later
- Produce outputs that are easy to review:
  - **Source business profile** (editable fields)
  - **Offer objects** (editable)
  - **Target list** (hyperlocal)
  - **Per-target**: scraped summary, match rationale, **1–10 rank**, **email draft**

## Non-goals (for hackathon)
- Auto-sending emails (draft-only)
- High-scale crawling, robust anti-bot, complex login flows
- Perfect entity resolution / deduplication

---

## Recommended services (heavy lifting)
### Scraping & crawling: Firecrawl
- **Scrape** a page into clean markdown: `POST https://api.firecrawl.dev/v2/scrape`
- **Crawl** a site to a page limit (async job): `POST https://api.firecrawl.dev/v2/crawl` then poll
- Output formats to request (MVP):
  - `markdown` (primary)
  - `links` (optional; helps discover relevant internal pages)
  - `html` (optional fallback)

Docs:
- `https://docs.firecrawl.dev/features/scrape`
- `https://docs.firecrawl.dev/advanced-scraping-guide`

### Hyperlocal business sourcing (choose one for MVP)
Pick **one** of the following to keep scope tight:
- **Google Places API (Nearby Search / Text Search)**: best coverage/quality; requires billing.
- **SerpApi (Google Maps Local Results)**: very fast integration; returns websites/phones often.
- **Yelp Fusion**: simple; good categories/ratings; sometimes fewer websites.

### LLM provider (analysis + generation): OpenAI GPT‑5.5
Use **OpenAI GPT‑5.5** for all “understand → structure → score → draft” steps, with **structured JSON outputs** (strict schema) so the app can run deterministically in a hackathon demo.

Use it for:
- Profile extraction from Firecrawl markdown (**structured JSON** + citations)
- Package/service offering generation (**structured JSON**)
- Target analysis + match scoring (**structured JSON**)
- Outreach drafting (subject options + body + personalization anchors)

### Backend (auth + database + storage): Supabase
Use **Supabase** for a hackathon-friendly backend:
- **Auth**: simple email/password or magic link
- **Database (Postgres)**: store projects, profiles, packages, targets, analyses, drafts
- **Storage** (optional): store raw Firecrawl markdown snapshots per scrape run (or keep in DB if small)

---

## Core objects (data model)
### `SourceBusinessProfile`
- `websiteUrl`
- `name`
- `description`
- `categories[]`
- `location` (address + city + region; best-effort)
- `serviceArea` (text)
- `contact` (emails[], phones[], contactPageUrl)
- `valueProps[]`
- `productsServices[]`
- `socialLinks[]`
- `hours` (optional)
- `citations[]` (see below)

### `Offer` (package / service offering — not a promo)
- `title`
- `shortPitch` (1–2 sentences)
- `details` (what it is, how it works, expected outcomes)
- `deliverables[]` (bullet list)
- `requirements[]` (what the partner needs to provide)
- `idealPartnerTypes[]` (categories/keywords)
- `pricingModel` (e.g., rev share, flat fee, per-referral, bundle price; can be “TBD”)
- `implementationTimeline` (e.g., “1 week onboarding”)
- `constraints` (geo, capacity limits, regulatory constraints)
- `ctaUrl` (landing page / Calendly / contact)
- `tone` (friendly/formal/direct)

### `TargetBusiness`
- `name`
- `address` / `city`
- `websiteUrl` (if present)
- `phone` (if present)
- `provider` (places/serpapi/yelp)
- `providerId`
- `distanceMeters` (if available)

### `TargetAnalysis`
- `targetProfile` (summary + key attributes)
- `matchReasons[]`
- `risks[]`
- `rank1to10`
- `personalizationAnchors[]` (facts used in the email + where they came from)
- `emailDraft`:
  - `subjectOptions[]`
  - `body`

### `Citation`
- `sourceUrl`
- `snippet` (short extracted text)
- `field` (which field it supports)

---

## Pipeline (end-to-end)

## 0) Inputs (minimal UI)
- Source business website URL
- City/area (or lat/lng) and radius (e.g., 2–10 miles)
- “Offer goal” (optional): referrals, bundles, co-marketing, events
- Target categories to search (e.g., `["gym","yoga studio","coffee shop"]`)

### Example: The Regrainery (owner inputs *before* scraping)
These are representative fields a business owner would fill in (or the app would collect) **before** Firecrawl runs on their site. They seed search, offers, and ranking—then scrape-derived `SourceBusinessProfile` data refines or overrides where needed.

| Field | Sample value |
| --- | --- |
| Website URL | `https://regrainery.com/` |
| Name (if known) | The Regrainery |
| One-line pitch | Custom furniture and built-ins from reclaimed and live-edge wood—tables, shelves, and statement pieces for homes and small commercial spaces in Portland. |
| City / area | Portland, OR — Northeast (Woodlawn / Concord) as home base; works citywide |
| Search radius | 5 miles |
| Partnership goal | Co-marketing and warm referrals to designers, stagers, and small venues that need wood fabrication for one-off or small-batch work—not high-volume contract manufacturing. |
| Target categories | `interior design studio`, `home staging company`, `residential architect`, `boutique hotel`, `specialty coffee with event space` |
| Exclusions (optional) | National furniture retail chains; high-volume import wholesalers |
| Extra context (free text) | Small shop, limits concurrent builds; best fit when clients care about material story. No kitchen-cabinet packages over ~20 units. Partners who’ve scoped look/timeline; we own fabrication and install. |
| Optional contact prefs | e.g. “Email mornings; no cold DMs to personal LinkedIn” |

A machine-readable version of the same example lives in `test-cases/websites.json` under `ownerInputsBeforeScrape` for the `regrainery` test case.

---

## 1) Build Source Business Profile (Firecrawl)
### Strategy (fast + reliable)
1. **Firecrawl scrape** the homepage to markdown.
2. Extract internal links; select likely pages: `about`, `services`, `products`, `menu`, `pricing`, `contact`, `locations`.
3. Firecrawl scrape up to **N pages** (e.g., 5–12) to markdown.
4. Concatenate markdown (with separators per URL) and ask **OpenAI GPT‑5.5** to output `SourceBusinessProfile` **structured JSON** + citations.

### Firecrawl calls (typical)
- `POST /v2/scrape` for each selected URL with:
  - `formats: ["markdown","links"]`
  - `maxAge` default is fine for hackathon; set `0` if you need freshness

### Output
- Display extracted profile fields with “source snippets” so user can trust/edit quickly.

---

## 2) Generate editable offers (LLM)
Input:
- `SourceBusinessProfile`
- Partnership goal + tone + constraints

Output:
- 3–8 **package/service offerings** (`Offer` objects)
- User selects/edits one “primary package” for outreach

---

## 3) Hyperlocal target discovery (provider)
Input:
- origin (address or lat/lng)
- radius
- included categories/keywords
- exclusions (optional): same category, chains

Output:
- 20–50 `TargetBusiness` rows (name/address/website/phone if available)

---

## 4) Scrape + analyze each target (Firecrawl + LLM)
For each `TargetBusiness`:
1. If `websiteUrl` exists:
   - Firecrawl scrape homepage + (optional) contact/about pages (2–5 pages).
   - GPT‑5.5 extracts a compact “target profile” + partnership angle (structured JSON).
2. If no website:
   - Use provider description/address/phone as fallback (still draft an email, but rank lower).

Output:
- `TargetAnalysis` including:
  - **rank1to10**
  - **matchReasons** and **risks**
  - **emailDraft**
  - personalization anchors (facts used)

---

## 5) Email draft generation (LLM)
### Constraints (MVP safety)
- Only reference facts that appear in:
  - Firecrawl markdown for the target site, or
  - provider metadata (address/phone/rating), if no website
- Include 1–2 specific “proof points” (personalization anchors) max, to avoid hallucinated details.

### Email template shape (example)
- **Subject options**: 2–3 variants
- **Body**:
  - Greeting + specific observation about target
  - 1–2 sentences about the source business (value proposition)
  - Clear **package/service offering** pitch (what it is, why it fits them, next step)
  - Low-friction CTA (“open to a 10-min call next week?”)
  - Signature

---

## Structured JSON contracts (recommended)
For hackathon speed, define a few schemas and require strict JSON output.

### 1) `SourceBusinessProfile` extraction
- Input: concatenated Firecrawl markdown + URL separators
- Output: `SourceBusinessProfile` + `citations[]`

### 2) `Offer[]` generation (packages/service offerings)
- Input: `SourceBusinessProfile` + “partnership goal” + tone + constraints
- Output: array of `Offer`

### 3) `TargetAnalysis` (per target)
- Input: `SourceBusinessProfile` + chosen primary `Offer` + target Firecrawl markdown + provider metadata
- Output: `TargetAnalysis` including `rank1to10`, reasons, anchors, email draft

---

## Match ranking (1–10)
Ranking should be a **single GPT‑5.5 judgment**: “Is this a good fit for a partnership package or not?”

- **Output**: `rank1to10` (integer 1–10)
- **Meaning**:
  - **9–10**: extremely strong fit; clear mutual value; easy to contact; low risk
  - **7–8**: good fit; reasonable odds; minor gaps/unknowns
  - **4–6**: unclear fit; needs reframing or more info; moderate risk
  - **1–3**: poor fit; likely mismatch or too hard to execute
- **Also require**:
  - `matchReasons[]` (2–4 bullets, grounded)
  - `risks[]` (0–3 bullets)
  - `personalizationAnchors[]` (the concrete facts used)

---

## Acceptance criteria (MVP demo checklist)
- User pastes a website URL and gets an editable business profile in < 2 minutes.
- User can generate at least 3 offers and edit one.
- User runs a hyperlocal search and sees 20+ candidate businesses.
- User selects 10 targets and gets:
  - per-target rank 1–10
  - 2–3 sentence rationale
  - a ready-to-send email draft with at least 1 real personalization anchor
- User exports drafts to CSV.

