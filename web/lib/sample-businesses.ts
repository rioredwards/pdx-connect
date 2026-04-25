export type SampleBusiness = {
  id: string;
  sort_order: number;
  name: string;
  website_url: string;
  discover_title: string;
  blurb: string | null;
  screenshot_url: string | null;
};

/** Mirrors `20260425180000_sample_businesses.sql` for local UI when PostgREST is not configured. */
const FALLBACK: SampleBusiness[] = [
  {
    id: "regrainery",
    sort_order: 1,
    name: "The Regrainery",
    website_url: "https://regrainery.com/",
    discover_title: "The Regrainery — local partners",
    blurb: "Trade fabrication, commercial woodwork",
    screenshot_url: null,
  },
  {
    id: "ziba",
    sort_order: 2,
    name: "Ziba Design",
    website_url: "https://ziba.com/",
    discover_title: "Ziba Design — local partners",
    blurb: "B2B product, service & brand work",
    screenshot_url: null,
  },
  {
    id: "holst",
    sort_order: 3,
    name: "Holst Architecture",
    website_url: "https://www.holstarch.com/",
    discover_title: "Holst Architecture — local partners",
    blurb: "Civic, workplace, commercial AEC",
    screenshot_url: null,
  },
  {
    id: "ankrom",
    sort_order: 4,
    name: "Ankrom Moisan",
    website_url: "https://ankrom.com/",
    discover_title: "Ankrom Moisan — local partners",
    blurb: "Workplace, multifamily, interiors",
    screenshot_url: null,
  },
  {
    id: "kpff",
    sort_order: 5,
    name: "KPFF",
    website_url: "https://www.kpff.com/",
    discover_title: "KPFF — local partners",
    blurb: "Structural & civil engineering",
    screenshot_url: null,
  },
  {
    id: "metaltoad",
    sort_order: 6,
    name: "Metal Toad",
    website_url: "https://www.metaltoad.com/",
    discover_title: "Metal Toad — local partners",
    blurb: "Cloud & app delivery for orgs",
    screenshot_url: null,
  },
  {
    id: "stoel",
    sort_order: 7,
    name: "Stoel Rives",
    website_url: "https://www.stoel.com/",
    discover_title: "Stoel Rives — local partners",
    blurb: "Business, IP & corporate law",
    screenshot_url: null,
  },
  {
    id: "bora",
    sort_order: 8,
    name: "BORA",
    website_url: "https://www.borarch.com/",
    discover_title: "BORA — local partners",
    blurb: "Labs, higher-ed, workplace design",
    screenshot_url: null,
  },
  {
    id: "mfa",
    sort_order: 9,
    name: "Maul Foster Alongi",
    website_url: "https://maulfosteralongi.com/",
    discover_title: "Maul Foster Alongi — local partners",
    blurb: "Env planning, land use, agency",
    screenshot_url: null,
  },
  {
    id: "esco",
    sort_order: 10,
    name: "Weir ESCO (ESCO)",
    website_url: "https://www.escorp.com/",
    discover_title: "Weir ESCO — local partners",
    blurb: "Engineered wear, mining, infrastructure",
    screenshot_url: null,
  },
];

/**
 * Fetches sample businesses from Supabase.
 * If `SUPABASE_URL` or `SUPABASE_ANON_KEY` is unset, returns the static fallback.
 */
export async function getSampleBusinesses(): Promise<SampleBusiness[]> {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) {
    return FALLBACK;
  }
  const restBase = base.replace(/\/$/, "");
  const url = new URL(`${restBase}/rest/v1/sample_businesses`);
  url.searchParams.set("select", "id,sort_order,name,website_url,discover_title,blurb,screenshot_url");
  url.searchParams.set("order", "sort_order.asc");

  try {
    const r = await fetch(url.toString(), {
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        accept: "application/json",
      },
      next: { revalidate: 300 },
    });
    if (!r.ok) {
      return FALLBACK;
    }
    const data = (await r.json()) as unknown;
    if (!Array.isArray(data) || data.length === 0) {
      return FALLBACK;
    }
    return data as SampleBusiness[];
  } catch {
    return FALLBACK;
  }
}
