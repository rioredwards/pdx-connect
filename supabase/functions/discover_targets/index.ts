// Supabase Edge Function: discover_targets
// Google Places API (New) text search -> public.target_businesses
// Docs: https://developers.google.com/maps/documentation/places/web-service/text-search

import { createClient } from "jsr:@supabase/supabase-js@2";

type Json = Record<string, unknown>;

const PLACES_SEARCH_TEXT = "https://places.googleapis.com/v1/places:searchText";
const PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.location",
  "places.types",
].join(",");

/** NE Portland (Woodlawn / Concord area) + ~5 miles — matches Regrainery test case. */
const DEFAULT_CENTER = { lat: 45.554, lng: -122.645 };
const DEFAULT_RADIUS_M = Math.round(5 * 1609.34);

const DEFAULT_TEXT_QUERIES = [
  "interior design studio",
  "home staging company",
  "residential architect",
  "boutique hotel",
  "coffee shop event space",
] as const;

type PlaceV1 = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
};

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

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const la = toRad(a.lat);
  const lb = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function cityFromAddress(formatted: string | undefined): string | null {
  if (!formatted) return null;
  const parts = formatted.split(",").map((p) => p.trim());
  if (parts.length < 2) return null;
  for (let i = parts.length - 2; i >= 0; i--) {
    if (/portland/i.test(parts[i] ?? "")) return "Portland";
  }
  return parts[Math.max(0, parts.length - 2)] ?? null;
}

async function placesSearchText(
  textQuery: string,
  apiKey: string,
  center: { lat: number; lng: number },
  radiusMeters: number,
): Promise<PlaceV1[]> {
  // Text Search: only `locationBias` supports a circle. `locationRestriction` is rectangle-only
  // (see Places API v1 SearchTextRequest). We bias to the area, then filter by radius in code.
  const r = Math.min(Math.max(100, radiusMeters), 50000);
  const body: Record<string, unknown> = {
    textQuery,
    pageSize: 20,
    languageCode: "en",
    regionCode: "US",
    locationBias: {
      circle: {
        center: { latitude: center.lat, longitude: center.lng },
        radius: r,
      },
    },
  };

  const resp = await fetch(PLACES_SEARCH_TEXT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": PLACES_FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  const json = (await resp.json()) as { places?: PlaceV1[]; error?: { message?: string; status?: string } };
  if (!resp.ok) {
    const msg = json?.error?.message ?? JSON.stringify(json);
    throw new Error(`Places searchText failed (${resp.status}): ${msg}`);
  }
  const places = json.places ?? [];
  // Keep only places within search radius (bias is soft).
  return places.filter((p) => {
    const lat = p.location?.latitude;
    const lng = p.location?.longitude;
    if (typeof lat !== "number" || typeof lng !== "number") return false;
    return haversineMeters(center, { lat, lng }) <= radiusMeters * 1.1;
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Use POST" });
  }

  let supabase: ReturnType<typeof createClient> | null = null;
  const tHandlerStart = performance.now();

  try {
    const expectedSecret = requireEnv("FUNCTION_AUTH_SECRET");
    const provided = getBearerToken(req);
    if (!provided || provided !== expectedSecret) {
      return jsonResponse(401, { error: "Unauthorized" });
    }

    const body = await req.json().catch(() => ({})) as {
      projectId?: string;
      sourceUrl?: string;
      title?: string;
      lat?: number;
      lng?: number;
      radiusMeters?: number;
      textQueries?: string[];
    };

    const mapsKey = firstEnv("GOOGLE_MAPS_API_KEY", "google_maps_api_key");

    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    supabase = createClient(supabaseUrl, supabaseServiceKey);

    const center = {
      lat: typeof body.lat === "number" ? body.lat : DEFAULT_CENTER.lat,
      lng: typeof body.lng === "number" ? body.lng : DEFAULT_CENTER.lng,
    };
    const radiusM = typeof body.radiusMeters === "number" && body.radiusMeters > 0
      ? body.radiusMeters
      : DEFAULT_RADIUS_M;

    const queries = Array.isArray(body.textQueries) && body.textQueries.length > 0
      ? body.textQueries.map((q) => String(q).trim()).filter(Boolean)
      : [...DEFAULT_TEXT_QUERIES];

    let projectId = typeof body.projectId === "string" ? body.projectId : null;
    if (!projectId) {
      const sourceUrl = typeof body.sourceUrl === "string" && body.sourceUrl
        ? body.sourceUrl
        : "https://regrainery.com/";
      const title = typeof body.title === "string" && body.title
        ? body.title
        : "The Regrainery";
      const { data: proj, error: pErr } = await supabase
        .from("projects")
        .insert({ source_url: sourceUrl, title, status: "discovery" })
        .select("id")
        .single();
      if (pErr) throw pErr;
      projectId = proj.id;
    }

    const byId = new Map<string, { place: PlaceV1; query: string }>();
    for (const q of queries) {
      const textQuery = q.toLowerCase().includes("portland") ? q : `${q} Portland OR`;
      const places = await placesSearchText(textQuery, mapsKey, center, radiusM);
      for (const p of places) {
        const id = p.id;
        if (id && !byId.has(id)) {
          byId.set(id, { place: p, query: textQuery });
        }
      }
    }

    const rows: Record<string, unknown>[] = [];
    for (const { place: p, query } of byId.values()) {
      const pid = p.id;
      if (!pid) continue;
      const plat = p.location?.latitude;
      const plng = p.location?.longitude;
      let distance: number | null = null;
      if (typeof plat === "number" && typeof plng === "number") {
        distance = Math.round(haversineMeters(center, { lat: plat, lng: plng }));
      }
      const name = p.displayName?.text?.trim() || "Unknown place";
      rows.push({
        project_id: projectId,
        provider: "google_places",
        provider_id: pid,
        name,
        address: p.formattedAddress ?? null,
        city: cityFromAddress(p.formattedAddress),
        website_url: p.websiteUri ?? null,
        phone: p.nationalPhoneNumber ?? null,
        distance_meters: distance,
        raw_provider: { place: p, searchQuery: query },
      });
    }

    if (rows.length === 0) {
      return jsonResponse(200, {
        ok: true,
        projectId,
        inserted: 0,
        message: "No places returned. Check API key, Places API (New) enabled, and billing.",
        targets: [],
        timings: { discoverEdgeMs: Math.round(performance.now() - tHandlerStart) },
      });
    }

    const { data: upserted, error: uErr } = await supabase
      .from("target_businesses")
      .upsert(rows, { onConflict: "project_id,provider,provider_id" })
      .select("id, name, address, city, website_url, phone, distance_meters, provider_id");

    if (uErr) throw uErr;

    const list = (upserted ?? []) as {
      id: string;
      name: string;
      address: string | null;
      city: string | null;
      website_url: string | null;
      phone: string | null;
      distance_meters: number | null;
      provider_id: string;
    }[];

    list.sort(
      (a, b) =>
        (a.distance_meters ?? 99999999) - (b.distance_meters ?? 99999999),
    );

    return jsonResponse(200, {
      ok: true,
      projectId,
      inserted: list.length,
      searchCenter: center,
      radiusMeters: radiusM,
      queries,
      targets: list,
      timings: { discoverEdgeMs: Math.round(performance.now() - tHandlerStart) },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonResponse(500, { ok: false, error: message });
  }
});
