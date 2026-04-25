import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 48, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <h1 style={{ margin: "0 0 12px", fontSize: 28, letterSpacing: -0.02, color: "#0f172a" }}>PDX Connect</h1>
      <p style={{ margin: "0 0 24px", color: "#475569", lineHeight: 1.6, fontSize: 16 }}>
        Hyperlocal partner discovery and outreach (hackathon MVP). The live workflow UI lives on a dedicated path so
        previews are easy to share.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <Link
          href="/analysis-tester"
          style={{
            display: "inline-block",
            padding: "12px 18px",
            borderRadius: 10,
            background: "#7c3aed",
            color: "white",
            fontWeight: 600,
            textDecoration: "none",
            fontSize: 15,
          }}
        >
          Open analysis tester →
        </Link>
        <Link
          href="/e2e-test-2"
          style={{
            display: "inline-block",
            padding: "12px 18px",
            borderRadius: 10,
            background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
            color: "white",
            fontWeight: 600,
            textDecoration: "none",
            fontSize: 15,
          }}
        >
          Partner finder demo →
        </Link>
        <Link
          href="/e2e-test"
          style={{
            display: "inline-block",
            padding: "12px 18px",
            borderRadius: 10,
            background: "white",
            color: "#5b21b6",
            fontWeight: 600,
            textDecoration: "none",
            fontSize: 15,
            border: "1px solid #a78bfa",
          }}
        >
          E2E test + timings →
        </Link>
      </div>
    </main>
  );
}
