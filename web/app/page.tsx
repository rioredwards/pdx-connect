import { ScrapeForm } from "./scrape-form";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: 24 }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 28, letterSpacing: -0.02 }}>
          pdx-connect
        </h1>
        <p style={{ margin: 0, color: "#334155", lineHeight: 1.5 }}>
          Next.js (Vercel) + Supabase Edge Functions test runner.
        </p>
      </header>

      <ScrapeForm />
    </main>
  );
}
