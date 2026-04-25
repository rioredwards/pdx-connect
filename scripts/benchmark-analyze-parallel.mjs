#!/usr/bin/env node
/**
 * Parallel benchmark for `analyze_target` (outreach + fit rank).
 *
 * Required env:
 *   PROJECT_ID              — uuid for the Regrainery (or any) project with target_businesses
 *   FUNCTION_AUTH_SECRET     — same as Supabase / Next SCRAPE_ANALYZE_SECRET
 *
 * One of:
 *   ANALYZE_TARGET_URL       — full .../functions/v1/analyze_target
 *   SCRAPE_ANALYZE_URL        — .../scrape_analyze (sibling URLs derived like the web app)
 *
 * And for listing targets (default derived from scrape URL):
 *   LIST_PROJECT_TARGETS_URL  — optional override
 *
 * Optional:
 *   BENCHMARK_CONCURRENCY     — in-flight cap (default 12)
 *   BENCHMARK_MAX_TARGETS     — how many to run (default 20, cap 100)
 *   BENCHMARK_ONLY_PENDING    — "0" to include already-analyzed targets (default 1 = pending only)
 *   BENCHMARK_SKIP_SCRAPE     — "1" to skip Firecrawl (LLM-only timing)
 *   BENCHMARK_OPENAI_MODEL    — e.g. gpt-5.4-nano (per-request override)
 *   BENCHMARK_TEXT_VERBOSITY  — low | medium
 *
 * Run (from repo root):
 *   PROJECT_ID=... FUNCTION_AUTH_SECRET=... SCRAPE_ANALYZE_URL=... node scripts/benchmark-analyze-parallel.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function requireEnv(name) {
  const v = process.env[name];
  if (!v?.trim()) {
    throw new Error(`Missing env: ${name}`);
  }
  return v.trim();
}

function deriveFunctionUrl(name, scrapeUrl) {
  if (!scrapeUrl.includes("scrape_analyze")) {
    throw new Error("SCRAPE_ANALYZE_URL must contain scrape_analyze, or set explicit *_URL for each function");
  }
  return scrapeUrl.replace("scrape_analyze", name);
}

function mapPool(items, concurrency, fn) {
  const n = items.length;
  if (n === 0) return Promise.resolve([]);
  const limit = Math.max(1, Math.min(concurrency, n));
  const results = new Array(n);
  let next = 0;

  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= n) return;
      results[i] = await fn(items[i], i);
    }
  };

  return Promise.all(Array.from({ length: limit }, () => worker())).then(() => results);
}

async function main() {
  const projectId = requireEnv("PROJECT_ID");
  const secret =
    process.env.FUNCTION_AUTH_SECRET?.trim() || process.env.SCRAPE_ANALYZE_SECRET?.trim() || null;
  if (!secret) {
    throw new Error("Set FUNCTION_AUTH_SECRET or SCRAPE_ALYZE_SECRET (same as Supabase / Next).");
  }
  const explicitAnalyze = process.env.ANALYZE_TARGET_URL?.trim();
  const scrapeUrl = process.env.SCRAPE_ANALYZE_URL?.trim();
  const explicitList = process.env.LIST_PROJECT_TARGETS_URL?.trim();
  if (!explicitAnalyze && !scrapeUrl) {
    throw new Error("Set ANALYZE_TARGET_URL or SCRAPE_ANALYZE_URL (for URL derivation).");
  }
  if (!explicitList && !scrapeUrl) {
    throw new Error("Set LIST_PROJECT_TARGETS_URL or SCRAPE_ALYZE_URL (for list_project_targets URL).");
  }
  const analyzeUrl = explicitAnalyze || deriveFunctionUrl("analyze_target", scrapeUrl);
  const listUrl = explicitList || deriveFunctionUrl("list_project_targets", scrapeUrl);

  const conc = Math.min(50, Math.max(1, parseInt(process.env.BENCHMARK_CONCURRENCY || "12", 10) || 12));
  const maxT = Math.min(100, Math.max(1, parseInt(process.env.BENCHMARK_MAX_TARGETS || "20", 10) || 20));
  const onlyPending = process.env.BENCHMARK_ONLY_PENDING !== "0";
  const skipScrape = process.env.BENCHMARK_SKIP_SCRAPE === "1";
  const openAiModel = process.env.BENCHMARK_OPENAI_MODEL?.trim() || undefined;
  const textVerbosity = process.env.BENCHMARK_TEXT_VERBOSITY?.trim();
  const verbosity =
    textVerbosity === "low" || textVerbosity === "medium" ? textVerbosity : undefined;

  const listRes = await fetch(listUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ projectId, onlyPending, max: maxT }),
  });
  const listText = await listRes.text();
  if (!listRes.ok) {
    throw new Error(`list_project_targets ${listRes.status}: ${listText}`);
  }
  const listJson = JSON.parse(listText);
  if (!listJson.ok) {
    throw new Error(`list_project_targets: ${listJson.error || listText}`);
  }
  const targets = listJson.targets;
  if (!Array.isArray(targets) || targets.length === 0) {
    console.error("No targets returned. Check PROJECT_ID, discovery rows, and only-pending filter.");
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        projectId,
        targets: targets.length,
        concurrency: conc,
        skipScrape,
        openAiModel: openAiModel ?? null,
        textVerbosity: verbosity ?? null,
        analyzeUrl: analyzeUrl.replace(/\/\/[^/]+/, "//…"),
      },
      null,
      2,
    ),
  );

  const t0 = performance.now();

  const results = await mapPool(targets, conc, async (t) => {
    const t1 = performance.now();
    const body = {
      targetBusinessId: t.id,
      skipScrape,
      ...(openAiModel ? { openAiModel } : {}),
      ...(verbosity ? { textVerbosity: verbosity } : {}),
    };
    const r = await fetch(analyzeUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    const ms = Math.round(performance.now() - t1);
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { parseError: text.slice(0, 500) };
    }
    return { id: t.id, name: t.name, status: r.status, ms, json };
  });

  const wallMs = Math.round(performance.now() - t0);
  const ok = results.filter((x) => x.status === 200 && x.json?.ok);
  const fail = results.filter((x) => !(x.status === 200 && x.json?.ok));

  const latencies = ok.map((x) => x.ms).sort((a, b) => a - b);
  const p50 = latencies.length ? latencies[Math.floor((latencies.length - 1) * 0.5)] : null;
  const p90 = latencies.length ? latencies[Math.floor((latencies.length - 1) * 0.9)] : null;

  console.log("\n--- results ---\n");
  for (const row of results) {
    const rank = row.json?.ok ? row.json?.analysis?.rank_1_to_10 : null;
    const tag = row.status === 200 && row.json?.ok ? "ok" : "fail";
    console.log(
      `${tag} ${row.ms}ms ${row.name} rank=${rank ?? "—"} openAiModel=${row.json?.openAiModel ?? "—"}`,
    );
    if (tag === "fail") {
      const err = row.json?.error || row.json?.parseError || `HTTP ${row.status}`;
      console.log(`   ${String(err).slice(0, 200)}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        wallClockMs: wallMs,
        completed: results.length,
        success: ok.length,
        failed: fail.length,
        latencyMs: { p50, p90, max: latencies.length ? latencies[latencies.length - 1] : null },
        modelSample: ok[0]?.json?.openAiModel ?? null,
      },
      null,
      2,
    ),
  );
}

try {
  const envLocal = path.join(__dirname, "../web/.env.local");
  let loaded = false;
  try {
    const raw = readFileSync(envLocal, "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = val;
        loaded = true;
      }
    }
  } catch {
    // no local env
  }
  if (loaded) {
    console.error("(loaded web/.env.local for missing vars)\n");
  }
} catch {
  // ignore
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
