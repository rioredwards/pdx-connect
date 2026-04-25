import type { Metadata } from "next";

import { getSampleBusinesses } from "@/lib/sample-businesses";

import { PartnerFinderDemo } from "./e2e-test-2/partner-finder-demo";

export const metadata: Metadata = {
  title: "PDX Connect — Find local partners",
  description:
    "Pick a Portland business and watch PDX Connect find nearby partners with personalized outreach drafts.",
};

export default async function HomePage() {
  const samples = await getSampleBusinesses();

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(1200px 600px at 10% -10%, #ede9fe 0%, transparent 60%), radial-gradient(900px 500px at 110% 10%, #dbeafe 0%, transparent 55%), #fafaff",
        padding: "32px 16px 80px",
      }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <header style={{ textAlign: "center", marginBottom: 36 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "6px 14px 6px 8px",
              borderRadius: 999,
              background: "white",
              boxShadow: "0 8px 22px -16px rgba(76, 29, 149, 0.55)",
              border: "1px solid rgba(124, 58, 237, 0.18)",
              color: "#5b21b6",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 0.2,
              marginBottom: 18,
            }}
          >
            <span
              aria-hidden
              style={{
                display: "inline-grid",
                placeItems: "center",
                width: 24,
                height: 24,
                borderRadius: 999,
                background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
                color: "white",
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              P
            </span>
            PDX Connect · Live demo
          </div>
          <h1
            style={{
              margin: "0 0 12px",
              fontSize: 44,
              letterSpacing: -0.03,
              color: "#0f172a",
              fontWeight: 800,
              lineHeight: 1.05,
            }}
          >
            Find your next Portland partner.
          </h1>
          <p
            style={{
              margin: "0 auto",
              maxWidth: 640,
              color: "#475569",
              fontSize: 18,
              lineHeight: 1.55,
            }}
          >
            Pick a sample business and we’ll scout nearby companies, study their websites, and hand you
            ready-to-send intros — ranked by partnership fit.
          </p>
        </header>

        {samples.length === 0 ? (
          <p style={{ color: "#b91c1c", textAlign: "center" }}>No sample businesses available.</p>
        ) : (
          <PartnerFinderDemo samples={samples} />
        )}
      </div>
    </main>
  );
}
