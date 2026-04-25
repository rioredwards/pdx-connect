import { AnalyzeForm } from "../analyze-form";
import { DiscoverForm } from "../discover-form";
import { ScrapeForm } from "../scrape-form";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analysis tester | pdx-connect",
  description: "Scrape, discover local partners, run outreach and fit analysis (MVP).",
};

export default function AnalysisTesterPage() {
  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: 24 }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 28, letterSpacing: -0.02 }}>Analysis tester</h1>
        <p style={{ margin: 0, color: "#334155", lineHeight: 1.5 }}>
          Scrape a source site, discover local partners (Google Places), then draft outreach and a 1–10 fit score per
          target (OpenAI). Batch analysis runs <strong>10</strong> targets at a time by default; adjust concurrency on
          the form.
        </p>
      </header>

      <ScrapeForm />
      <DiscoverForm />
      <AnalyzeForm />
    </main>
  );
}
