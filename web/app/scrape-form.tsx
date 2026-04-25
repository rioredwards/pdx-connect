"use client";

import { useActionState } from "react";

import { scrapeWebsiteAction, type ScrapeState } from "./actions";
import { ProfileDisplay } from "./profile-display";

const initialState: ScrapeState | null = null;

export function ScrapeForm() {
  const [state, formAction] = useActionState(scrapeWebsiteAction, initialState);

  return (
    <form
      action={formAction}
      style={{
        display: "grid",
        gap: 12,
        padding: 16,
        border: "1px solid #e6e6e6",
        borderRadius: 12,
        background: "white",
      }}
    >
      <div style={{ display: "grid", gap: 8 }}>
        <label htmlFor="url" style={{ fontSize: 14, fontWeight: 600 }}>
          Website URL
        </label>
        <input
          id="url"
          name="url"
          type="url"
          required
          placeholder="https://example.com"
          defaultValue="https://regrainery.com/"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #d7d7d7",
            fontSize: 14,
          }}
        />
        <div style={{ fontSize: 12, color: "#5b6472" }}>
          This calls the Supabase Edge Function <code>scrape_analyze</code> using server-only secrets.
        </div>
      </div>

      <button
        type="submit"
        style={{
          justifySelf: "start",
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #111827",
          background: "#111827",
          color: "white",
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        Run test scrape
      </button>

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
            wordBreak: "break-word",
            fontSize: 13,
          }}
        >
          {state.error}
        </pre>
      ) : null}

      {state && state.ok ? (
        <>
          <ProfileDisplay
            profile={state.view.extractedProfile}
            pagesScraped={state.view.pagesScraped}
            projectId={state.view.projectId}
            scrapeRunId={state.view.scrapeRunId}
          />
          <details
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              background: "white",
            }}
          >
            <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#475569" }}>
              Raw JSON response
            </summary>
            <pre
              style={{
                margin: "12px 0 0",
                padding: 12,
                borderRadius: 8,
                background: "#f1f5f9",
                border: "1px solid #e2e8f0",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: 12,
                lineHeight: 1.45,
              }}
            >
              {state.pretty}
            </pre>
          </details>
        </>
      ) : null}
    </form>
  );
}
