// List target_businesses for a project (for batch analyze). Service role only.

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

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice("bearer ".length).trim() || null;
}

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

    const body = (await req.json().catch(() => ({}))) as {
      projectId?: string;
      onlyPending?: boolean;
      max?: number;
    };

    if (!body.projectId || typeof body.projectId !== "string") {
      return jsonResponse(400, { error: "Missing 'projectId' (uuid string)" });
    }

    const onlyPending = body.onlyPending !== false;
    const max = typeof body.max === "number" && body.max > 0 ? Math.min(body.max, 100) : 50;

    const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));

    const { data: rows, error: qErr } = await supabase
      .from("target_businesses")
      .select("id, name, distance_meters")
      .eq("project_id", body.projectId)
      .order("distance_meters", { ascending: true });

    if (qErr) throw qErr;

    let list = rows ?? [];

    if (onlyPending && list.length > 0) {
      const ids = list.map((r) => r.id);
      const { data: doneRows, error: dErr } = await supabase
        .from("target_analyses")
        .select("target_business_id")
        .in("target_business_id", ids);
      if (dErr) throw dErr;
      const done = new Set((doneRows ?? []).map((r) => r.target_business_id as string));
      list = list.filter((r) => !done.has(r.id));
    }

    const targets = list.slice(0, max).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      distance_meters: r.distance_meters as number | null,
    }));

    return jsonResponse(200, { ok: true, projectId: body.projectId, onlyPending, targets });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonResponse(500, { ok: false, error: message });
  }
});
