"use client";

import { useActionState, useEffect, useRef } from "react";

import { scrapeWebsiteAction, type ScrapeState } from "./actions";
import { ProfileDisplay } from "./profile-display";
import type { WorkflowProject } from "./workflow-types";

const initialState: ScrapeState | null = null;

type Props = {
  /** Fires when step 1 succeeds so the rest of the flow can use the same `project_id`. */
  onWorkflowProjectReady?: (project: WorkflowProject) => void;
};

export function ScrapeForm({ onWorkflowProjectReady }: Props = {}) {
  const [state, formAction] = useActionState(scrapeWebsiteAction, initialState);
  const lastNotified = useRef<string | null>(null);

  useEffect(() => {
    if (!state?.ok || !state.view.projectId) return;
    const { projectId, sourceUrl } = state.view;
    const key = `${projectId}:${state.view.scrapeRunId ?? ""}`;
    if (lastNotified.current === key) return;
    lastNotified.current = key;
    onWorkflowProjectReady?.({ projectId, sourceUrl });
  }, [state, onWorkflowProjectReady]);

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
      <div>
        <h2 style={{ margin: "0 0 6px", fontSize: 18, color: "#0f172a" }}>1. Source business (scrape)</h2>
        <p style={{ margin: 0, fontSize: 14, color: "#64748b", lineHeight: 1.5 }}>
          Creates a <code>project</code> and extracted profile. Steps 2–3 will use that project.
        </p>
      </div>
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
