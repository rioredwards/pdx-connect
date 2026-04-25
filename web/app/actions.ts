"use server";

import type { ExtractedProfile } from "./extracted-profile";

export type ScrapeSuccessView = {
  extractedProfile: ExtractedProfile | null;
  pagesScraped?: number;
  projectId?: string;
  scrapeRunId?: string;
};

export type ScrapeState =
  | { ok: true; pretty: string; view: ScrapeSuccessView }
  | { ok: false; error: string };

function requireServerEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing server env var: ${name}`);
  return v;
}

type EdgeFunctionName =
  | "scrape_analyze"
  | "discover_targets"
  | "analyze_target"
  | "list_project_targets";

/** Derive sibling function URLs from `.../v1/scrape_analyze` or set per-function env overrides. */
function edgeFunctionUrl(name: EdgeFunctionName): string {
  if (name === "discover_targets" && process.env.DISCOVER_TARGETS_URL) {
    return process.env.DISCOVER_TARGETS_URL;
  }
  if (name === "analyze_target" && process.env.ANALYZE_TARGET_URL) {
    return process.env.ANALYZE_TARGET_URL;
  }
  if (name === "list_project_targets" && process.env.LIST_PROJECT_TARGETS_URL) {
    return process.env.LIST_PROJECT_TARGETS_URL;
  }
  const u = requireServerEnv("SCRAPE_ANALYZE_URL");
  if (!u.includes("scrape_analyze")) {
    throw new Error(
      "Set SCRAPE_ANALYZE_URL to …/functions/v1/scrape_analyze, or set per-function URL env vars",
    );
  }
  return u.replace("scrape_analyze", name);
}

export type ListedTarget = { id: string; name: string; distance_meters: number | null };

export type ListTargetsState =
  | { ok: true; projectId: string; targets: ListedTarget[]; onlyPending: boolean }
  | { ok: false; error: string };

export async function listProjectTargetsAction(
  projectId: string,
  onlyPending: boolean,
  max: number,
): Promise<ListTargetsState> {
  try {
    const pid = projectId.trim();
    if (!pid) {
      return { ok: false, error: "projectId is required." };
    }
    const endpoint = edgeFunctionUrl("list_project_targets");
    const secret = requireServerEnv("SCRAPE_ANALYZE_SECRET");

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        projectId: pid,
        onlyPending,
        max: Math.min(Math.max(1, max), 100),
      }),
      cache: "no-store",
    });

    const text = await resp.text();
    if (!resp.ok) {
      return { ok: false, error: `Edge function error (${resp.status}): ${text}` };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return { ok: false, error: "Edge function returned non-JSON." };
    }

    const root = parsed as {
      ok?: boolean;
      error?: string;
      projectId?: string;
      onlyPending?: boolean;
      targets?: ListedTarget[];
    };

    if (!root.ok) {
      return { ok: false, error: root.error ?? "list_project_targets failed." };
    }

    return {
      ok: true,
      projectId: root.projectId ?? pid,
      onlyPending: root.onlyPending ?? onlyPending,
      targets: root.targets ?? [],
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}

export type TargetRow = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  website_url: string | null;
  phone: string | null;
  distance_meters: number | null;
  provider_id: string;
};

export type DiscoverState =
  | {
      ok: true;
      pretty: string;
      summary: {
        projectId: string;
        inserted: number;
        queries: string[];
        searchCenter: { lat: number; lng: number };
        radiusMeters: number;
        targets: TargetRow[];
      };
    }
  | { ok: false; error: string };

export async function discoverTargetsAction(
  _prev: DiscoverState | null,
  _formData: FormData,
): Promise<DiscoverState> {
  try {
    const endpoint = edgeFunctionUrl("discover_targets");
    const secret = requireServerEnv("SCRAPE_ANALYZE_SECRET");

    const body = {
      title: "The Regrainery — local partners",
      sourceUrl: "https://regrainery.com/",
    };

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await resp.text();
    if (!resp.ok) {
      return { ok: false, error: `Edge function error (${resp.status}): ${text}` };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return { ok: false, error: "Edge function returned non-JSON." };
    }

    const root = parsed as {
      ok?: boolean;
      projectId?: string;
      inserted?: number;
      queries?: string[];
      searchCenter?: { lat: number; lng: number };
      radiusMeters?: number;
      targets?: TargetRow[];
      error?: string;
    };

    if (!root.ok) {
      return { ok: false, error: root.error ?? "Unknown error from discover_targets." };
    }

    return {
      ok: true,
      pretty: JSON.stringify(parsed, null, 2),
      summary: {
        projectId: root.projectId ?? "",
        inserted: root.inserted ?? 0,
        queries: root.queries ?? [],
        searchCenter: root.searchCenter ?? { lat: 45.554, lng: -122.645 },
        radiusMeters: root.radiusMeters ?? 8047,
        targets: root.targets ?? [],
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}

export type AnalysisResult = {
  targetBusinessId: string;
  projectId: string;
  scrapeRunId: string;
  analysis: {
    id: string;
    target_business_id: string;
    rank_1_to_10: number | null;
    payload: {
      targetProfile?: { summary: string; keyAttributes: string[] };
      emailDraft?: { subjectOptions: string[]; body: string };
      personalizationAnchors?: { fact: string; sourceUrl: string }[];
      matchReasons?: string[];
      risks?: string[];
      rank1to10?: number;
    };
  };
};

export type AnalyzeState =
  | { ok: true; pretty: string; result: AnalysisResult }
  | { ok: false; error: string };

const ANALYZE_MAX_ATTEMPTS = 5;
const ANALYZE_BASE_DELAY_MS = 900;

function sleepMs(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function jitterMs(max: number) {
  return Math.floor(Math.random() * max);
}

/** Parse Retry-After: seconds (number) or HTTP-date. */
function retryAfterMsFromResponse(resp: Response): number | null {
  const h = resp.headers.get("retry-after");
  if (!h) return null;
  const u = h.trim();
  if (/^\d+$/.test(u)) {
    const s = parseInt(u, 10);
    if (!Number.isNaN(s)) return s * 1000;
  }
  const t = Date.parse(h);
  if (!Number.isNaN(t)) return Math.max(0, t - Date.now());
  return null;
}

function isRetryableHttpStatus(status: number) {
  return status === 429 || status === 408 || status === 502 || status === 503;
}

export async function analyzeTargetAction(
  _prev: AnalyzeState | null,
  formData: FormData,
): Promise<AnalyzeState> {
  try {
    const targetBusinessId = String(formData.get("targetBusinessId") ?? "").trim();
    if (!targetBusinessId) {
      return { ok: false, error: "Target business id is required (copy from the discovery table or DB)." };
    }
    const skipScrape = formData.get("skipScrape") === "on" || formData.get("skipScrape") === "true";

    const endpoint = edgeFunctionUrl("analyze_target");
    const secret = requireServerEnv("SCRAPE_ANALYZE_SECRET");
    const body = JSON.stringify({ targetBusinessId, skipScrape });

    let lastError = "analyze_target failed.";

    for (let attempt = 0; attempt < ANALYZE_MAX_ATTEMPTS; attempt++) {
      let resp: Response;
      try {
        resp = await fetch(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${secret}`,
            "content-type": "application/json",
          },
          body,
          cache: "no-store",
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        lastError = `Request failed: ${message}`;
        if (attempt < ANALYZE_MAX_ATTEMPTS - 1) {
          const wait = Math.min(ANALYZE_BASE_DELAY_MS * 2 ** attempt + jitterMs(400), 30_000);
          await sleepMs(wait);
          continue;
        }
        return { ok: false, error: lastError };
      }

      const text = await resp.text();
      if (!resp.ok) {
        lastError = `Edge function error (${resp.status}): ${text}`;
        if (attempt < ANALYZE_MAX_ATTEMPTS - 1 && isRetryableHttpStatus(resp.status)) {
          const ra = retryAfterMsFromResponse(resp);
          const exp = Math.min(ANALYZE_BASE_DELAY_MS * 2 ** attempt + jitterMs(500), 45_000);
          await sleepMs(ra != null ? Math.max(ra, exp) : exp);
          continue;
        }
        return { ok: false, error: lastError };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        lastError = "Edge function returned non-JSON.";
        if (attempt < ANALYZE_MAX_ATTEMPTS - 1) {
          await sleepMs(Math.min(ANALYZE_BASE_DELAY_MS * 2 ** attempt, 20_000));
          continue;
        }
        return { ok: false, error: lastError };
      }

      const root = parsed as {
        ok?: boolean;
        error?: string;
        targetBusinessId?: string;
        projectId?: string;
        scrapeRunId?: string;
        analysis?: AnalysisResult["analysis"];
      };

      if (!root.ok) {
        return { ok: false, error: root.error ?? "analyze_target failed." };
      }
      if (!root.analysis) {
        return { ok: false, error: "Missing analysis in response." };
      }

      const result: AnalysisResult = {
        targetBusinessId: root.targetBusinessId ?? targetBusinessId,
        projectId: root.projectId ?? "",
        scrapeRunId: root.scrapeRunId ?? "",
        analysis: root.analysis,
      };

      return { ok: true, pretty: JSON.stringify(parsed, null, 2), result };
    }

    return { ok: false, error: lastError };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}

export async function scrapeWebsiteAction(
  _prev: ScrapeState | null,
  formData: FormData,
): Promise<ScrapeState> {
  try {
    const url = String(formData.get("url") ?? "").trim();
    if (!url) return { ok: false, error: "URL is required." };

    const endpoint = requireServerEnv("SCRAPE_ANALYZE_URL");
    const secret = requireServerEnv("SCRAPE_ANALYZE_SECRET");

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ url }),
      cache: "no-store",
    });

    const text = await resp.text();
    if (!resp.ok) {
      return { ok: false, error: `Edge function error (${resp.status}): ${text}` };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return { ok: false, error: "Edge function returned non-JSON." };
    }

    const root = parsed as {
      extractedProfile?: ExtractedProfile;
      pagesScraped?: number;
      projectId?: string;
      scrapeRunId?: string;
    };

    const view: ScrapeSuccessView = {
      extractedProfile: root.extractedProfile ?? null,
      pagesScraped: root.pagesScraped,
      projectId: root.projectId,
      scrapeRunId: root.scrapeRunId,
    };

    return { ok: true, pretty: JSON.stringify(parsed, null, 2), view };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}
