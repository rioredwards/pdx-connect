#!/usr/bin/env node
/**
 * Capture a screenshot for every row in `public.sample_businesses` via Firecrawl
 * and store the resulting URL on `screenshot_url`.
 *
 * Required env (loaded from web/.env.local automatically if present):
 *   SUPABASE_URL                 e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY    service role key (NOT the anon key)
 *   FIRECRAWL_API_KEY            fc-...
 *
 * Optional:
 *   ONLY_MISSING=1               only refresh rows with screenshot_url IS NULL
 *   CONCURRENCY=4                parallel firecrawl calls
 *
 * Run from repo root:
 *   node scripts/refresh-sample-screenshots.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnv(file) {
  try {
    const raw = readFileSync(file, "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const [, k, vRaw] = m;
      if (process.env[k]) continue;
      let v = vRaw.trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      else if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
      process.env[k] = v;
    }
    return true;
  } catch {
    return false;
  }
}

const tried = [
  ["supabase/.env.local", path.join(__dirname, "../supabase/.env.local")],
  ["supabase/.env", path.join(__dirname, "../supabase/.env")],
  ["web/.env.local", path.join(__dirname, "../web/.env.local")],
];
const loaded = tried.filter(([, p]) => loadDotEnv(p)).map(([n]) => n);
if (loaded.length) {
  console.error(`(loaded ${loaded.join(" + ")})`);
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v?.trim()) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

const SUPABASE_URL = requireEnv("SUPABASE_URL").replace(/\/$/, "");
const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const FIRECRAWL_KEY = requireEnv("FIRECRAWL_API_KEY");
const ONLY_MISSING = process.env.ONLY_MISSING === "1";
const CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.CONCURRENCY) || 4));

async function fetchSamples() {
  const url = new URL(`${SUPABASE_URL}/rest/v1/sample_businesses`);
  url.searchParams.set("select", "id,name,website_url,screenshot_url");
  url.searchParams.set("order", "sort_order.asc");
  const r = await fetch(url, {
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      accept: "application/json",
    },
  });
  if (!r.ok) {
    throw new Error(`Failed to fetch samples (${r.status}): ${await r.text()}`);
  }
  return r.json();
}

async function captureScreenshot(websiteUrl) {
  const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      authorization: `Bearer ${FIRECRAWL_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      url: websiteUrl,
      formats: ["screenshot"],
      onlyMainContent: false,
    }),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok || !json?.success) {
    throw new Error(`Firecrawl failed (${r.status}): ${JSON.stringify(json).slice(0, 240)}`);
  }
  return json?.data?.screenshot ?? json?.data?.metadata?.screenshot ?? null;
}

async function updateRow(id, screenshotUrl) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/sample_businesses`);
  url.searchParams.set("id", `eq.${id}`);
  const r = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({ screenshot_url: screenshotUrl }),
  });
  if (!r.ok) {
    throw new Error(`PATCH failed (${r.status}): ${await r.text()}`);
  }
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
  const all = await fetchSamples();
  const work = ONLY_MISSING ? all.filter((r) => !r.screenshot_url) : all;
  if (work.length === 0) {
    console.log("Nothing to do. (Use ONLY_MISSING=0 to force a refresh.)");
    return;
  }

  console.log(
    `Refreshing ${work.length}/${all.length} sample screenshots (concurrency ${CONCURRENCY})...`,
  );

  const t0 = Date.now();
  const summary = await mapPool(work, CONCURRENCY, async (row) => {
    const t = Date.now();
    try {
      const url = await captureScreenshot(row.website_url);
      if (!url) {
        console.warn(` ! ${row.name}: Firecrawl returned no screenshot`);
        return { id: row.id, ok: false };
      }
      await updateRow(row.id, url);
      console.log(` ✓ ${row.name} (${Date.now() - t} ms)`);
      return { id: row.id, ok: true };
    } catch (e) {
      console.warn(` ! ${row.name}: ${e.message}`);
      return { id: row.id, ok: false };
    }
  });

  const okCount = summary.filter((s) => s.ok).length;
  console.log(`\nDone: ${okCount}/${work.length} updated in ${Date.now() - t0} ms.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
