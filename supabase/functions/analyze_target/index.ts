// Supabase Edge Function: analyze_target
// Optional target-site Firecrawl -> OpenAI (1) outreach draft -> OpenAI (2) fit rank 1–10
// Persists to target_analyses + scrape_runs (kind=target)

import { createClient } from "jsr:@supabase/supabase-js@2";

type Json = Record<string, unknown>;

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

function parseOpenAiStructuredJson(responseJson: {
  output?: Array<{ type?: string; content?: unknown[] }>;
  output_text?: string;
}): unknown {
  const items = responseJson?.output ?? [];
  const messageItem = items.find((o) => o?.type === "message") ?? items[items.length - 1];
  const content = (messageItem?.content ?? responseJson?.output?.[0]?.content ?? []) as unknown[];
  const jsonPart = content.find((c: { type?: string; json?: unknown }) => (c as { type?: string }).type === "output_json");
  if (jsonPart && typeof jsonPart === "object" && jsonPart !== null && "json" in jsonPart && (jsonPart as { json?: unknown }).json != null) {
    return (jsonPart as { json: unknown }).json;
  }
  const textPart = content.find((c: { type?: string; text?: string }) => (c as { type?: string }).type === "output_text");
  const rawText = textPart && typeof textPart === "object" && textPart !== null && "text" in textPart
    ? (textPart as { text?: string }).text
    : undefined;
  if (typeof rawText === "string" && rawText.trim().startsWith("{")) {
    return JSON.parse(rawText);
  }
  const top = responseJson?.output_text;
  if (typeof top === "string" && top.trim().startsWith("{")) return JSON.parse(top);
  throw new Error(`OpenAI response missing structured JSON: ${JSON.stringify(responseJson)}`);
}

async function firecrawlScrapePage(url: string, apiKey: string): Promise<unknown> {
  const resp = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ url, formats: ["markdown"] }),
  });
  const json = await resp.json();
  if (!resp.ok || !json?.success) {
    throw new Error(`Firecrawl scrape failed (${resp.status}): ${JSON.stringify(json)}`);
  }
  return json;
}

async function openaiResponses(
  model: string,
  input: string,
  schema: Record<string, unknown>,
  schemaName: string,
  description: string,
  apiKey: string,
) {
  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      input,
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          description,
          schema,
          strict: true,
        },
        verbosity: "medium",
      },
    }),
  });
  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(`OpenAI call failed (${resp.status}): ${JSON.stringify(json)}`);
  }
  return parseOpenAiStructuredJson(json);
}

const OUTREACH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    targetProfile: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
        keyAttributes: { type: "array", items: { type: "string" } },
      },
      required: ["summary", "keyAttributes"],
    },
    personalizationAnchors: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          fact: { type: "string" },
          sourceUrl: { type: "string" },
        },
        required: ["fact", "sourceUrl"],
      },
    },
    emailDraft: {
      type: "object",
      additionalProperties: false,
      properties: {
        subjectOptions: { type: "array", items: { type: "string" } },
        body: { type: "string" },
      },
      required: ["subjectOptions", "body"],
    },
  },
  required: ["targetProfile", "personalizationAnchors", "emailDraft"],
} as const;

const RANK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    rank1to10: { type: "integer", minimum: 1, maximum: 10 },
    matchReasons: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
  },
  required: ["rank1to10", "matchReasons", "risks"],
} as const;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Use POST" });
  }

  try {
    const expectedSecret = requireEnv("FUNCTION_AUTH_SECRET");
    const provided = getBearerToken(req);
    if (!provided || provided !== expectedSecret) {
      return jsonResponse(401, { error: "Unauthorized" });
    }

    const body = (await req.json().catch(() => ({}))) as { targetBusinessId?: string; skipScrape?: boolean };
    if (!body.targetBusinessId || typeof body.targetBusinessId !== "string") {
      return jsonResponse(400, { error: "Missing 'targetBusinessId' (uuid string)" });
    }

    const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const openaiKey = firstEnv("OPENAI_API_KEY", "openai_api_key");
    const firecrawlKey = firstEnv("FIRECRAWL_API_KEY", "firecrawl_api_key");
    const model = "gpt-5.5";

    const { data: target, error: tErr } = await supabase
      .from("target_businesses")
      .select("id, project_id, name, address, city, website_url, phone, distance_meters, provider, provider_id, raw_provider")
      .eq("id", body.targetBusinessId)
      .single();
    if (tErr) throw tErr;
    if (!target) {
      return jsonResponse(404, { error: "Target business not found" });
    }

    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select("id, source_profile, source_url, partnership_goal, title, source_name")
      .eq("id", target.project_id)
      .single();
    if (pErr) throw pErr;
    if (!project) {
      return jsonResponse(404, { error: "Project not found" });
    }

    const { data: offerRow } = await supabase
      .from("offers")
      .select("payload, is_primary, sort_order")
      .eq("project_id", project.id)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    const defaultOffer: Json = {
      title: "Partnership for custom wood fabrication & referrals",
      shortPitch: (project as { partnership_goal?: string }).partnership_goal ||
        "Co-marketing and warm referrals to partners who need trusted local wood fabrication and install.",
      details: "No saved Offer row — this is a default package description. Add an `offers` record for a tighter pitch.",
      deliverables: ["Design-aligned millwork or furniture", "Communication through build and install"],
      requirements: ["Scoped aesthetic and timeline from partner’s client or project"],
      idealPartnerTypes: ["Interior design", "Staging", "Architecture", "Hospitality"],
      pricingModel: "TBD",
      implementationTimeline: "TBD",
      constraints: (project as { partnership_goal?: string }).partnership_goal || "",
      ctaUrl: (project as { source_url?: string }).source_url || "",
      tone: "friendly",
    };
    const offerPayload = (offerRow?.payload as Json) ?? defaultOffer;

    const sourceProfile = project.source_profile ?? {};
    const sourceLabel = (sourceProfile as { name?: string }).name ||
      (project as { source_name?: string; title?: string }).source_name ||
      (project as { title?: string }).title ||
      "Source business";

    // --- Scrape run (target) ---
    const inputUrl = (target.website_url as string) ||
      `https://map.local/target/${(target as { id: string }).id}`;
    const { data: run, error: rErr } = await supabase
      .from("scrape_runs")
      .insert({
        project_id: project.id,
        target_business_id: target.id,
        input_url: inputUrl,
        kind: "target",
        status: "running",
        model,
      })
      .select("id")
      .single();
    if (rErr) throw rErr;
    const runId = run.id as string;

    let targetMarkdown = "";
    let firecrawlSnapshot: unknown = null;
    const site = target.website_url as string | null;
    if (site && !body.skipScrape) {
      try {
        firecrawlSnapshot = await firecrawlScrapePage(site, firecrawlKey);
        targetMarkdown = String((firecrawlSnapshot as { data?: { markdown?: string } })?.data?.markdown ?? "");
        await supabase
          .from("scrape_runs")
          .update({
            status: "succeeded",
            firecrawl_response: firecrawlSnapshot,
          })
          .eq("id", runId);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await supabase
          .from("scrape_runs")
          .update({ status: "failed", error: message })
          .eq("id", runId);
        targetMarkdown =
          `(Firecrawl failed: ${message})\n\n` +
          `Use listing metadata only.\n` +
          JSON.stringify(
            {
              name: target.name,
              address: target.address,
              city: target.city,
              phone: target.phone,
              website: target.website_url,
            },
            null,
            2,
          );
      }
    } else {
      targetMarkdown = site
        ? "Scrape skipped by request.\n\n" + (target.name as string)
        : "No public website in listing. Use name, address, and phone from metadata only.\n\n" +
          JSON.stringify(
            {
              name: target.name,
              address: target.address,
              city: target.city,
              phone: target.phone,
              website: target.website_url,
              raw: target.raw_provider,
            },
            null,
            2,
          );
      await supabase
        .from("scrape_runs")
        .update({
          status: "succeeded",
          firecrawl_response: { skipped: true, reason: site ? "skipScrape" : "no_website" },
        })
        .eq("id", runId);
    }

    const targetMeta = {
      name: target.name,
      address: target.address,
      city: target.city,
      websiteUrl: target.website_url,
      phone: target.phone,
      distanceMeters: target.distance_meters,
      provider: target.provider,
    };

    // --- OpenAI 1: outreach (separate API call) ---
    const outreachPrompt = `You help a local B2B partnership outreach. Draft an email the SOURCE business could send to the TARGET.

Rules:
- Only state facts that appear in SOURCE PROFILE, OFFER, TARGET METADATA, or TARGET SITE MARKDOWN. If something is unknown, do not invent it.
- personalizationAnchors: 2–4 short facts the email leans on, with sourceUrl pointing to a page (target site, source site, or "listing" if only metadata).
- targetProfile: brief summary and key attributes of the TARGET.
- emailDraft: 2–3 subject lines and an email body (plain text). Friendly, specific, not salesy. Include a light CTA (e.g. short call) when appropriate.

SOURCE BUSINESS (${sourceLabel}):
${JSON.stringify(sourceProfile, null, 2)}

PRIMARY OFFER / PACKAGE (JSON):
${JSON.stringify(offerPayload, null, 2)}

TARGET METADATA (from discovery / Places):
${JSON.stringify(targetMeta, null, 2)}

TARGET SITE MARKDOWN (may be short or from listing only):
${targetMarkdown}
`;

    const outreach = (await openaiResponses(
      model,
      outreachPrompt,
      OUTREACH_SCHEMA as unknown as Record<string, unknown>,
      "outreach_draft",
      "Cold email + anchors + target summary for a partner outreach",
      openaiKey,
    )) as {
      targetProfile: { summary: string; keyAttributes: string[] };
      personalizationAnchors: { fact: string; sourceUrl: string }[];
      emailDraft: { subjectOptions: string[]; body: string };
    };

    // --- OpenAI 2: rank (separate API call) ---
    const rankPrompt = `You evaluate realistic odds that a *partnership conversation* (not a sale) between SOURCE and TARGET would succeed: mutual fit, believable value exchange, and practical reachability.

Output rank1to10 and reasons. Do NOT re-write the email. Use the same grounding rules: only support claims with the data provided. If data is thin, say so in risks and score conservatively.

Rubric (1–10):
- 9–10: very strong fit; clear mutual value; good chance of reply.
- 7–8: good fit; credible with minor gaps.
- 4–6: unclear or uneven fit.
- 1–3: poor fit or mismatch.

SOURCE BUSINESS CONTEXT:
${JSON.stringify({ source: sourceProfile, offer: offerPayload }, null, 2)}

TARGET:
${JSON.stringify({ ...targetMeta, targetProfile: outreach.targetProfile }, null, 2)}

DRAFT OUTREACH (for context only; rank partnership fit, not email quality):
Subjects: ${outreach.emailDraft.subjectOptions.join(" | ")}
Body:
${outreach.emailDraft.body}
`;

    const rank = (await openaiResponses(
      model,
      rankPrompt,
      RANK_SCHEMA as unknown as Record<string, unknown>,
      "partnership_rank",
      "1–10 partnership fit with reasons and risks",
      openaiKey,
    )) as { rank1to10: number; matchReasons: string[]; risks: string[] };

    const rankInt = Math.min(10, Math.max(1, Math.round(Number(rank.rank1to10) || 5)));

    const analysisPayload: Json = {
      targetProfile: outreach.targetProfile,
      personalizationAnchors: outreach.personalizationAnchors,
      emailDraft: outreach.emailDraft,
      matchReasons: rank.matchReasons,
      risks: rank.risks,
      rank1to10: rankInt,
    };

    const { data: analysisRow, error: aErr } = await supabase
      .from("target_analyses")
      .upsert(
        {
          target_business_id: target.id,
          scrape_run_id: runId,
          status: "complete",
          rank_1_to_10: rankInt,
          payload: analysisPayload,
        },
        { onConflict: "target_business_id" },
      )
      .select("id, target_business_id, rank_1_to_10, payload")
      .single();
    if (aErr) throw aErr;

    return jsonResponse(200, {
      ok: true,
      targetBusinessId: target.id,
      projectId: project.id,
      scrapeRunId: runId,
      analysis: analysisRow,
      openAiCalls: { outreach: 1, rank: 1 },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonResponse(500, { ok: false, error: message });
  }
});
