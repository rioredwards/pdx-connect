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

## Match scoring (1–10)
Define rank as “expected partnership success + mutual value”.

### Simple rubric (hackathon-friendly)
- **Audience overlap** (0–3)
- **Offer fit** (0–2)
- **Geo proximity** (0–2)
- **Brand alignment** (0–1)
- **Partner-likelihood signals** (0–1)
- **Contactability** (0–1)

Map to `rank1to10`:
- \(0–2\) → 1–3
- \(3–5\) → 4–6
- \(6–7\) → 7–8
- \(8–10\) → 9–10

---

## Minimal implementation plan (1–2 days)
### Day 1: working end-to-end
- **Input form**: source URL + location + radius + target categories
- **Source profile**:
  - scrape 5–12 pages via Firecrawl
  - LLM extracts `SourceBusinessProfile`
- **Offers**:
  - LLM generates 3–8 offers
  - user selects/edits 1 offer
- **Target discovery**:
  - call one provider and list targets

### Day 2: target analysis + outreach drafts
- For top N targets (e.g., 10–25):
  - Firecrawl scrape 2–5 pages each
  - LLM produces `TargetAnalysis` (rank + email draft)
- **Export**:
  - CSV download: target, rank, reasons, subject, body, website

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

