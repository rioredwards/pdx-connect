"use server";

export type ScrapeState =
  | { ok: true; pretty: string }
  | { ok: false; error: string };

function requireServerEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing server env var: ${name}`);
  return v;
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

    return { ok: true, pretty: JSON.stringify(parsed, null, 2) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}
