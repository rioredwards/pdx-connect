import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CacheEntry = { url: string; expiresAt: number };

const TTL_MS = 1000 * 60 * 60 * 6;
const cache = new Map<string, CacheEntry>();

const inflight = new Map<string, Promise<string | null>>();

function safeUrl(input: string): string | null {
  try {
    const u = new URL(input);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

async function fetchScreenshotFromFirecrawl(url: string): Promise<string | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return null;
  try {
    const resp = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["screenshot"],
        onlyMainContent: false,
      }),
      cache: "no-store",
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as {
      success?: boolean;
      data?: { screenshot?: string; metadata?: { screenshot?: string } };
    };
    if (!json.success) return null;
    return json.data?.screenshot ?? json.data?.metadata?.screenshot ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("url") ?? "";
  const url = safeUrl(raw);
  if (!url) {
    return NextResponse.json({ ok: false, error: "Bad url." }, { status: 400 });
  }

  const now = Date.now();
  const cached = cache.get(url);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(
      { ok: true, screenshotUrl: cached.url },
      {
        headers: {
          "cache-control": "public, max-age=21600, s-maxage=21600, stale-while-revalidate=86400",
        },
      },
    );
  }

  let pending = inflight.get(url);
  if (!pending) {
    pending = fetchScreenshotFromFirecrawl(url);
    inflight.set(url, pending);
    pending.finally(() => inflight.delete(url));
  }
  const screenshotUrl = await pending;

  if (!screenshotUrl) {
    return NextResponse.json(
      { ok: false, error: "No screenshot available." },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }

  cache.set(url, { url: screenshotUrl, expiresAt: now + TTL_MS });
  return NextResponse.json(
    { ok: true, screenshotUrl },
    {
      headers: {
        "cache-control": "public, max-age=21600, s-maxage=21600, stale-while-revalidate=86400",
      },
    },
  );
}
