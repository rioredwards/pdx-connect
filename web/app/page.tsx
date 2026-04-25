import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 48, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <h1 style={{ margin: "0 0 12px", fontSize: 28, letterSpacing: -0.02, color: "#0f172a" }}>pdx-connect</h1>
      <p style={{ margin: "0 0 24px", color: "#475569", lineHeight: 1.6, fontSize: 16 }}>
        Hyperlocal partner discovery and outreach (hackathon MVP). The live workflow UI lives on a dedicated path so
        previews are easy to share.
      </p>
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
    </main>
  );
}
