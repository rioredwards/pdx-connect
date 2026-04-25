"use client";

import type { CSSProperties } from "react";
import { useActionState } from "react";

import { discoverTargetsAction, type DiscoverState } from "./actions";

const initial: DiscoverState | null = null;

function miles(m: number | null | undefined) {
  if (m == null) return "—";
  return `${(m / 1609.34).toFixed(1)} mi`;
}

type DiscoverFormProps = {
  /** From step 1: discovery writes targets under this project. */
  activeProjectId: string | null;
  sourceUrl?: string | null;
};

export function DiscoverForm({ activeProjectId, sourceUrl }: DiscoverFormProps) {
  const [state, formAction] = useActionState(discoverTargetsAction, initial);

  return (
    <section
      style={{
        display: "grid",
        gap: 16,
        marginTop: 32,
        padding: 16,
        border: "1px solid #e6e6e6",
        borderRadius: 12,
        background: "white",
      }}
    >
      <div>
        <h2 style={{ margin: "0 0 6px", fontSize: 18, color: "#0f172a" }}>2. Local partners (Google Places)</h2>
        <p style={{ margin: 0, fontSize: 14, color: "#64748b", lineHeight: 1.5 }}>
          Uses the <strong>same project as step 1</strong> (the site you scraped). Text Search around NE Portland (~5 mi)
          with default categories (interiors, staging, architecture, hotels, event-friendly cafés). Results are saved to{" "}
          <code>target_businesses</code> for that project.
        </p>
        {sourceUrl ? (
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "#475569" }}>
            Source business: <code style={{ fontSize: 12 }}>{sourceUrl}</code>
          </p>
        ) : null}
        {!activeProjectId ? (
          <p
            style={{
              margin: "10px 0 0",
              padding: 10,
              borderRadius: 8,
              background: "#fffbeb",
              border: "1px solid #fde68a",
              color: "#92400e",
              fontSize: 13,
            }}
          >
            Run <strong>step 1</strong> first. After a successful scrape, this step is enabled and partners are linked to
            that business’s project.
          </p>
        ) : (
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "#64748b" }}>
            Project: <code>{activeProjectId}</code>
          </p>
        )}
      </div>

      <form action={formAction}>
        <input type="hidden" name="projectId" value={activeProjectId ?? ""} />
        <button
          type="submit"
          disabled={!activeProjectId}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #0d9488",
            background: activeProjectId ? "#0d9488" : "#99f6e4",
            color: "white",
            fontSize: 14,
            fontWeight: 600,
            cursor: activeProjectId ? "pointer" : "not-allowed",
          }}
        >
          Find potential partners
        </button>
      </form>

      {state && !state.ok ? (
        <pre
          style={{
            margin: 0,
            padding: 12,
            borderRadius: 10,
            background: "#fff1f2",
            border: "1px solid #fecdd3",
            color: "#881337",
            whiteSpace: "pre-wrap",
            fontSize: 13,
          }}
        >
          {state.error}
        </pre>
      ) : null}

      {state && state.ok ? (
        <>
          <p style={{ margin: 0, fontSize: 14, color: "#334155" }}>
            <strong>{state.summary.inserted}</strong> rows · project <code>{state.summary.projectId}</code> · center{" "}
            {state.summary.searchCenter.lat.toFixed(3)}, {state.summary.searchCenter.lng.toFixed(3)} · radius ≈{" "}
            {miles(state.summary.radiusMeters)} · queries: {state.summary.queries.join(" · ")}
          </p>

          <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 10 }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                  <th style={{ padding: "10px 12px" }}>Distance</th>
                  <th style={{ padding: "10px 12px" }}>Name</th>
                  <th style={{ padding: "10px 12px" }}>Address</th>
                  <th style={{ padding: "10px 12px" }}>Phone</th>
                  <th style={{ padding: "10px 12px" }}>Website</th>
                </tr>
              </thead>
              <tbody>
                {state.summary.targets.map((t) => (
                  <tr key={t.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                      {miles(t.distance_meters)}
                    </td>
                    <td style={{ padding: "8px 12px", fontWeight: 500 }}>{t.name}</td>
                    <td style={{ padding: "8px 12px", color: "#475569" }}>{t.address}</td>
                    <td style={{ padding: "8px 12px" }}>{t.phone ?? "—"}</td>
                    <td style={{ padding: "8px 12px", maxWidth: 220, wordBreak: "break-all" } satisfies CSSProperties}>
                      {t.website_url ? (
                        <a href={t.website_url} target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>
                          {t.website_url.replace(/^https?:\/\//, "").slice(0, 40)}
                          {t.website_url.length > 40 ? "…" : ""}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details
            style={{
              padding: 12,
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              background: "#f8fafc",
            }}
          >
            <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#475569" }}>
              Raw discover_targets JSON
            </summary>
            <pre
              style={{
                margin: "12px 0 0",
                fontSize: 11,
                lineHeight: 1.4,
                overflow: "auto",
                maxHeight: 320,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {state.pretty}
            </pre>
          </details>
        </>
      ) : null}
    </section>
  );
}
