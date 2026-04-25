import type { Metadata } from "next";

import { getSampleBusinesses } from "@/lib/sample-businesses";

import { Wizard } from "./wizard";

export const metadata: Metadata = {
  title: "pdx-connect",
  description: "Hyperlocal partner discovery + outreach drafts (hackathon MVP).",
};

export default async function HomePage() {
  const samples = await getSampleBusinesses();
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:px-6 md:py-14">
      <header className="mb-8 grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          pdx-connect
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Scrape a Portland small business, discover nearby complementary partners, and draft a
          personalized outreach email with a 1–10 fit rank for each.
        </p>
      </header>
      <Wizard samples={samples} />
    </main>
  );
}
