// Supabase Edge Function: scrape_analyze
// Flow: URL -> multi-page Firecrawl (markdown + links) -> OpenAI structured profile -> store in DB

import { createClient } from "jsr:@supabase/supabase-js@2";

type Json = Record<string, unknown>;

const DEFAULT_MAX_EXTRA_PAGES = 5;
const MAX_EXTRA_PAGES_CAP = 11;
const SCRAPE_CONCURRENCY = 3;

function jsonResponse(status: number, body: Json) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/** Supabase secrets are sometimes set with lowercase names in the dashboard. */
function firstEnv(...names: string[]): string {
  for (const name of names) {
    const v = Deno.env.get(name);
    if (v) return v;
  }
  throw new Error(`Missing env: one of ${names.join(", ")}`);
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice("bearer ".length).trim() || null;
}

function canonicalUrlKey(u: URL): string {
  const path = u.pathname.replace(/\/+$/, "") || "/";
  return `${u.protocol}//${u.host}${path}`.toLowerCase();
}

/** Pull link strings from Firecrawl v2 `data.links` (strings or { url }). */
function linksFromData(data: unknown): string[] {
  const raw = (data as { links?: unknown } | null)?.links;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "url" in item) {
        const u = (item as { url?: unknown }).url;
        return typeof u === "string" ? u : null;
      }
      return null;
    })
    .filter((s): s is string => Boolean(s));
}

function pathScore(pathname: string): number {
  const p = pathname.toLowerCase();
  if (/^\/$/.test(p)) return 0;
  let s = 0;
  if (/(^|\/)about(\/|$)|our-story|who-we|team|mission|story/.test(p)) s += 6;
  if (/(^|\/)service|services|product|products|work|what-we|offer|package|menu/.test(p)) s += 6;
  if (/(^|\/)contact|location|locations|find-us|visit|hours/.test(p)) s += 5;
  if (/(^|\/)pricing|price|book|reservation|schedule/.test(p)) s += 4;
  if (/(^|\/)faq|support|resource/.test(p)) s += 2;
  if (/(^|\/)blog|news|article|press/.test(p)) s += 0;
  return s;
}

/**
 * Select same-origin static-looking paths for follow-up scrapes.
 */
function selectExtraPageUrls(
  homeUrl: string,
  linkStrings: string[],
  maxExtra: number,
): string[] {
  if (maxExtra <= 0) return [];
  let home: URL;
  try {
    home = new URL(homeUrl);
  } catch {
    return [];
  }
  const homeKey = canonicalUrlKey(home);
  const seen = new Set<string>([homeKey]);
  const candidates: { url: URL; score: number }[] = [];
  for (const raw of linkStrings) {
    if (!raw || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("javascript:")) {
      continue;
    }
    let u: URL;
    try {
      u = new URL(raw, homeUrl);
    } catch {
      continue;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") continue;
    if (u.host.toLowerCase() !== home.host.toLowerCase()) continue;
    if (u.hash && u.pathname === home.pathname) continue;
    u.hash = "";
    const k = canonicalUrlKey(u);
    if (seen.has(k)) continue;
    if (/\.(pdf|jpg|jpeg|png|gif|svg|zip|mp4|webp)(\?|$)/i.test(u.pathname)) continue;
    const sc = pathScore(u.pathname);
    if (sc < 1) continue;
    seen.add(k);
    candidates.push({ url: u, score: sc });
  }
  candidates.sort((a, b) => b.score - a.score || a.url.pathname.length - b.url.pathname.length);
  return candidates.slice(0, maxExtra).map((c) => c.url.href);
}

function combinePageMarkdown(sections: { url: string; markdown: string }[]): string {
  return sections
    .map(
      ({ url, markdown }) =>
        `## Source page: ${url}\n\n${markdown || "(no markdown)"}\n\n---\n`,
    )
    .join("\n");
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]!);
      }
    },
  );
  await Promise.all(workers);
  return out;
}

async function firecrawlScrape(url: string, apiKey: string) {
  const resp = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown", "links"],
      // For hackathon: rely on default caching unless you need fresh content.
    }),
  });

  const json = await resp.json();
  if (!resp.ok || !json?.success) {
    throw new Error(
      `Firecrawl scrape failed (${resp.status}): ${JSON.stringify(json)}`,
    );
  }
  return json;
}

type PageScrape = { url: string; success: true; data: unknown } | { url: string; success: false; error: string };

/**
 * Scrape the homepage, discover internal links, scrape a bounded set of
 * high-signal pages, then return combined markdown and per-page details for storage.
 */
async function scrapeSourceBusinessSite(
  homeUrl: string,
  apiKey: string,
  maxExtraPages: number,
): Promise<{
  combinedMarkdown: string;
  homeScrape: unknown;
  pageResults: PageScrape[];
}> {
  const homeJson = await firecrawlScrape(homeUrl, apiKey);
  const homeData = (homeJson as { data?: { markdown?: string; links?: unknown } })?.data;
  const homeMd = homeData?.markdown ?? "";
  const linkStrings = linksFromData(homeData);
  const extraUrls = selectExtraPageUrls(homeUrl, linkStrings, maxExtraPages);

  const extraResults = await mapPool<string, PageScrape>(extraUrls, SCRAPE_CONCURRENCY, async (u) => {
    try {
      const j = await firecrawlScrape(u, apiKey);
      return { url: u, success: true as const, data: j };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { url: u, success: false, error: message };
    }
  });

  const sections: { url: string; markdown: string }[] = [
    { url: homeUrl, markdown: homeMd },
  ];
  for (const r of extraResults) {
    if (r.success) {
      const md = (r.data as { data?: { markdown?: string } })?.data?.markdown ?? "";
      sections.push({ url: r.url, markdown: md });
    }
  }

  return {
    combinedMarkdown: combinePageMarkdown(sections),
    homeScrape: homeJson,
    pageResults: [
      { url: homeUrl, success: true, data: homeJson },
      ...extraResults,
    ],
  };
}

async function openaiExtractProfile(
  markdown: string,
  sourceUrl: string,
  apiKey: string,
  userHint?: string,
) {
  // Using Responses API for structured JSON extraction.
  // Note: model name per product spec: "gpt-5.5"
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      websiteUrl: { type: "string" },
      name: { type: "string" },
      description: { type: "string" },
      categories: { type: "array", items: { type: "string" } },
      location: {
        type: "object",
        additionalProperties: false,
        properties: {
          address: { type: "string" },
          city: { type: "string" },
          region: { type: "string" },
          country: { type: "string" },
        },
        required: ["address", "city", "region", "country"],
      },
      serviceArea: { type: "string" },
      contact: {
        type: "object",
        additionalProperties: false,
        properties: {
          emails: { type: "array", items: { type: "string" } },
          phones: { type: "array", items: { type: "string" } },
          contactPageUrl: { type: "string" },
        },
        required: ["emails", "phones", "contactPageUrl"],
      },
      valueProps: { type: "array", items: { type: "string" } },
      productsServices: { type: "array", items: { type: "string" } },
      socialLinks: { type: "array", items: { type: "string" } },
      hours: { type: "string" },
      citations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            field: { type: "string" },
            sourceUrl: { type: "string" },
            snippet: { type: "string" },
          },
          required: ["field", "sourceUrl", "snippet"],
        },
      },
    },
    required: [
      "websiteUrl",
      "name",
      "description",
      "categories",
      "location",
      "serviceArea",
      "contact",
      "valueProps",
      "productsServices",
      "socialLinks",
      "hours",
      "citations",
    ],
  };

  const ownerHintBlock = userHint && userHint.trim()
    ? `\nOwner hint (user-supplied; treat as authoritative for intent and context, but only include facts also supported by the website content):\n${userHint.trim()}\n`
    : "";

  const prompt = `Extract a structured business profile from the provided website content.

The markdown may come from several pages of the same site, separated by "## Source page:" headings.

Rules:
- Output MUST conform to the JSON schema.
- If a field is unknown, use an empty string or empty array, but keep required fields present.
- Citations: use the "Source page" URL when citing which page a snippet came from.
- If sections conflict, prefer information from an About, Services, or Contact page over generic home copy when appropriate.
${ownerHintBlock}
Primary website URL: ${sourceUrl}
Content (markdown):
${markdown}
`;

  // Structured outputs: https://platform.openai.com/docs/guides/structured-outputs
  // Request body: https://platform.openai.com/docs/api-reference/responses/create (`text` → ResponseTextConfig)
  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.5",
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "source_business_profile",
          description: "SourceBusinessProfile for a local business website, with citation snippets per field.",
          schema,
          strict: true,
        },
        verbosity: "medium",
      },
    }),
  });

  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(`OpenAI extraction failed (${resp.status}): ${JSON.stringify(json)}`);
  }

  // Responses API: prefer the `message` output item (after optional `reasoning` items).
  const items = json?.output ?? [];
  const messageItem = items.find((o: { type?: string }) => o?.type === "message") ?? items[items.length - 1];
  const content = (messageItem?.content ?? json?.output?.[0]?.content ?? []) as unknown[];
  const jsonPart = content.find((c: { type?: string; json?: unknown }) => c?.type === "output_json");
  if (jsonPart && typeof jsonPart === "object" && "json" in jsonPart && jsonPart.json != null) {
    return jsonPart.json;
  }

  const textPart = content.find((c: { type?: string; text?: string }) => c?.type === "output_text");
  const rawText = textPart && typeof textPart === "object" && "text" in textPart
    ? (textPart as { text?: string }).text
    : undefined;
  if (typeof rawText === "string" && rawText.trim().startsWith("{")) {
    return JSON.parse(rawText);
  }

  const top = json?.output_text;
  if (typeof top === "string" && top.trim().startsWith("{")) return JSON.parse(top);

  throw new Error(`OpenAI response missing structured JSON: ${JSON.stringify(json)}`);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Use POST" });
  }

  let supabase: ReturnType<typeof createClient> | null = null;
  let runId: string | null = null;

  const tHandlerStart = performance.now();
  try {
    // Shared secret between your Next.js (Vercel) server and this Edge Function.
    // Set `FUNCTION_AUTH_SECRET` in Supabase function secrets to match Vercel's `SCRAPE_ANALYZE_SECRET`.
    const expectedSecret = requireEnv("FUNCTION_AUTH_SECRET");
    const provided = getBearerToken(req);
    if (!provided || provided !== expectedSecret) {
      return jsonResponse(401, { error: "Unauthorized" });
    }

    const body = await req.json().catch(() => ({}));
    const { url, projectId, maxExtraPages: rawMaxExtra, userHint: rawUserHint } = body as {
      url?: string;
      projectId?: string;
      maxExtraPages?: number;
      userHint?: string;
    };
    if (!url || typeof url !== "string") {
      return jsonResponse(400, { error: "Missing 'url' (string)" });
    }
    const userHint = typeof rawUserHint === "string" ? rawUserHint.slice(0, 800).trim() : "";

    const maxExtra = Math.min(
      MAX_EXTRA_PAGES_CAP,
      Math.max(0, Number.isFinite(rawMaxExtra) ? Number(rawMaxExtra) : DEFAULT_MAX_EXTRA_PAGES),
    );

    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const firecrawlKey = firstEnv("FIRECRAWL_API_KEY", "firecrawl_api_key");
    const openaiKey = firstEnv("OPENAI_API_KEY", "openai_api_key");

    supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Ensure project exists (or create ephemeral)
    let effectiveProjectId: string | null = typeof projectId === "string" ? projectId : null;
    if (!effectiveProjectId) {
      const { data: proj, error: projErr } = await supabase
        .from("projects")
        .insert({ source_url: url, status: "created" })
        .select("id")
        .single();
      if (projErr) throw projErr;
      effectiveProjectId = proj.id;
    }

    const { data: run, error: runErr } = await supabase
      .from("scrape_runs")
      .insert({
        project_id: effectiveProjectId,
        input_url: url,
        status: "running",
        model: "gpt-5.5",
        kind: "source",
      })
      .select("id")
      .single();
    if (runErr) throw runErr;
    runId = run.id;

    const tFirecrawl = performance.now();
    const { combinedMarkdown, homeScrape, pageResults } = await scrapeSourceBusinessSite(
      url,
      firecrawlKey,
      maxExtra,
    );
    const sourceFirecrawlMs = Math.round(performance.now() - tFirecrawl);

    const firecrawlBundle = {
      strategy: "multi_page" as const,
      maxExtraPages: maxExtra,
      home: homeScrape,
      pageResults,
      combinedMarkdown,
    };

    const tOpenAi = performance.now();
    const extracted = await openaiExtractProfile(combinedMarkdown, url, openaiKey, userHint);
    const sourceOpenAiMs = Math.round(performance.now() - tOpenAi);

    const { error: updRunErr } = await supabase
      .from("scrape_runs")
      .update({
        status: "succeeded",
        firecrawl_response: firecrawlBundle,
        extracted_profile: extracted,
      })
      .eq("id", run.id);
    if (updRunErr) throw updRunErr;

    const { error: projUpdErr } = await supabase
      .from("projects")
      .update({
        source_profile: extracted,
        source_name: typeof extracted.name === "string" ? extracted.name : null,
      })
      .eq("id", effectiveProjectId);
    if (projUpdErr) throw projUpdErr;

    return jsonResponse(200, {
      ok: true,
      projectId: effectiveProjectId,
      scrapeRunId: run.id,
      extractedProfile: extracted,
      pagesScraped: pageResults.length,
      timings: {
        sourceFirecrawlMs,
        sourceOpenAiMs,
        sourceEdgeMs: Math.round(performance.now() - tHandlerStart),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (supabase && runId) {
      await supabase
        .from("scrape_runs")
        .update({ status: "failed", error: message })
        .eq("id", runId);
    }
    return jsonResponse(500, { ok: false, error: message });
  }
});

