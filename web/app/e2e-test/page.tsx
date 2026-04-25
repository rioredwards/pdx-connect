import { E2eTestWorkflow } from "./e2e-test-workflow";

import { getSampleBusinesses } from "@/lib/sample-businesses";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "E2E workflow | pdx-connect",
  description: "Run scrape → discover → outreach + rank with per-step timings.",
};

export default async function E2eTestPage() {
  const samples = await getSampleBusinesses();

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: 24 }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 28, letterSpacing: -0.02 }}>E2E workflow test</h1>
        <p style={{ margin: 0, color: "#334155", lineHeight: 1.55, fontSize: 15 }}>
          Pick a <strong>sample business</strong>, then run the full pipeline: source scrape (Firecrawl + profile
          extract), local discovery, and analysis on the closest targets. Server timings are measured inside each edge
          function; <strong>client RTT</strong> is the round-trip for each server action (includes Next + network).
        </p>
      </header>

      {samples.length === 0 ? (
        <p style={{ color: "#b91c1c" }}>No sample businesses available.</p>
      ) : (
        <E2eTestWorkflow samples={samples} />
      )}
    </main>
  );
}
