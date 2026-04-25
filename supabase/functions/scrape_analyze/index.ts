// Supabase Edge Function: scrape_analyze
// Flow: URL -> Firecrawl markdown -> OpenAI GPT-5.5 structured JSON profile -> store in DB

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

async function openaiExtractProfile(markdown: string, sourceUrl: string, apiKey: string) {
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

  const prompt = `Extract a structured business profile from the provided website content.

Rules:
- Output MUST conform to the JSON schema.
- If a field is unknown, use an empty string or empty array, but keep required fields present.
- Citations: include short snippets and URLs supporting key fields (name, description, location/contact, services).

Website URL: ${sourceUrl}
Content (markdown):
${markdown}
`;

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.5",
      input: prompt,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "source_business_profile",
          schema,
          strict: true,
        },
      },
    }),
  });

  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(`OpenAI extraction failed (${resp.status}): ${JSON.stringify(json)}`);
  }

  // Responses API returns structured output in output_text or output[].content.
  // With json_schema, we can rely on output[0].content[0].json in many cases, but keep it defensive.
  const content = json?.output?.[0]?.content ?? [];
  const jsonPart = content.find((c: any) => c?.type === "output_json");
  if (jsonPart?.json) return jsonPart.json;

  // Fallback: try parsing output_text
  const text = json?.output_text;
  if (typeof text === "string" && text.trim().startsWith("{")) return JSON.parse(text);

  throw new Error(`OpenAI response missing structured JSON: ${JSON.stringify(json)}`);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Use POST" });
  }

  try {
    const { url, projectId } = await req.json().catch(() => ({}));
    if (!url || typeof url !== "string") {
      return jsonResponse(400, { error: "Missing 'url' (string)" });
    }

    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const firecrawlKey = requireEnv("FIRECRAWL_API_KEY");
    const openaiKey = requireEnv("OPENAI_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
      })
      .select("id")
      .single();
    if (runErr) throw runErr;

    const firecrawl = await firecrawlScrape(url, firecrawlKey);
    const markdown = firecrawl?.data?.markdown ?? "";
    const extracted = await openaiExtractProfile(markdown, url, openaiKey);

    const { error: updErr } = await supabase
      .from("scrape_runs")
      .update({
        status: "succeeded",
        firecrawl_response: firecrawl,
        extracted_profile: extracted,
      })
      .eq("id", run.id);
    if (updErr) throw updErr;

    return jsonResponse(200, {
      ok: true,
      projectId: effectiveProjectId,
      scrapeRunId: run.id,
      extractedProfile: extracted,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonResponse(500, { ok: false, error: message });
  }
});

