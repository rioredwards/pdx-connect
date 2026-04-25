"use client";

import { useActionState, useState } from "react";

import { mapPool } from "@/lib/batch-pool";

import {
  analyzeTargetAction,
  listProjectTargetsAction,
  type AnalyzeState,
  type ListTargetsState,
} from "./actions";

const initial: AnalyzeState | null = null;

type BatchLine = { name: string; ok: boolean; rank?: number | null; error?: string };

export function AnalyzeForm() {
  const [state, formAction] = useActionState(analyzeTargetAction, initial);
  const p = state && state.ok ? state.result.analysis.payload : null;
  const rank = state && state.ok ? state.result.analysis.rank_1_to_10 : null;

  const [projectId, setProjectId] = useState("");
  const [batchOnlyPending, setBatchOnlyPending] = useState(true);
  const [batchSkipScrape, setBatchSkipScrape] = useState(false);
  /** In-flight at once (1–50). Not all 50 strict parallel: caps simultaneous edge calls. */
  const [batchConcurrency, setBatchConcurrency] = useState(10);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
  const [batchLog, setBatchLog] = useState<BatchLine[]>([]);
  const [batchError, setBatchError] = useState<string | null>(null);

  async function runBatch50() {
    setBatchError(null);
    setBatchLog([]);
    const pid = projectId.trim();
    if (!pid) {
      setBatchError("Enter a project ID (from the discovery run summary).");
      return;
    }

    setBatchRunning(true);
    setBatchProgress({ done: 0, total: 0 });

    let list: ListTargetsState = { ok: false, error: "not started" };
    try {
      list = await listProjectTargetsAction(pid, batchOnlyPending, 50);
    } catch (e) {
      setBatchRunning(false);
      setBatchError(e instanceof Error ? e.message : String(e));
      return;
    }

    if (!list.ok) {
      setBatchRunning(false);
      setBatchError(list.error);
      return;
    }

    const targets = list.targets;
    if (targets.length === 0) {
      setBatchRunning(false);
      setBatchError(
        batchOnlyPending
          ? "No targets left to analyze (all have an entry in target_analyses), or no rows for this project. Uncheck “only without analysis” to re-run."
          : "No targets for this project.",
      );
      return;
    }

    setBatchProgress({ done: 0, total: targets.length });
    setBatchLog([]);

    const conc = Math.min(50, Math.max(1, Math.floor(batchConcurrency) || 10));
    const logLines: BatchLine[] = [];

    await mapPool(
      targets,
      conc,
      async (t) => {
        const fd = new FormData();
        fd.set("targetBusinessId", t.id);
        fd.set("skipScrape", batchSkipScrape ? "true" : "");
        const r = await analyzeTargetAction(null, fd);
        return { t, r };
      },
      (_i, { t, r }) => {
        if (r.ok) {
          logLines.push({
            name: t.name,
            ok: true,
            rank: r.result.analysis.rank_1_to_10 ?? r.result.analysis.payload.rank1to10 ?? null,
          });
        } else {
          logLines.push({ name: t.name, ok: false, error: r.error });
        }
        setBatchLog([...logLines]);
        setBatchProgress({ done: logLines.length, total: targets.length });
      },
    );

    setBatchRunning(false);
  }

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
        <h2 style={{ margin: "0 0 6px", fontSize: 18, color: "#0f172a" }}>3. Outreach + fit rank (OpenAI)</h2>
        <p style={{ margin: 0, fontSize: 14, color: "#64748b", lineHeight: 1.5 }}>
          Calls <code>analyze_target</code>: optional Firecrawl of the target site, then <strong>two</strong> OpenAI
          Responses (structured): (1) email draft + anchors + target summary, (2) partnership fit <strong>1–10</strong>{" "}
          with match reasons and risks. Saved to <code>target_analyses</code>.
        </p>
      </div>

      <div
        style={{
          padding: 14,
          borderRadius: 10,
          border: "1px solid #ddd6fe",
          background: "#faf5ff",
        }}
      >
        <h3 style={{ margin: "0 0 8px", fontSize: 15, color: "#5b21b6" }}>Batch: up to 50 targets</h3>
        <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6b21a8", lineHeight: 1.45 }}>
          Runs many analyses in parallel, capped by <strong>concurrency</strong> (separate server requests per target so
          nothing hits one giant timeout). The edge function <strong>retries</strong> on 429 / transient errors with
          backoff and <code>Retry-After</code> when present. List comes from <code>list_project_targets</code> (closest
          first). “Only without analysis” skips targets that already have <code>target_analyses</code>.
        </p>
        <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="batchProjectId" style={{ fontSize: 14, fontWeight: 600 }}>
              Project ID
            </label>
            <input
              id="batchProjectId"
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="UUID from discovery (e.g. after “Run potential partners”)"
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #d7d7d7",
                fontSize: 14,
              }}
            />
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, color: "#475569" }}>
            <input
              type="checkbox"
              checked={batchOnlyPending}
              onChange={(e) => setBatchOnlyPending(e.target.checked)}
            />
            Only targets without an analysis yet
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, color: "#475569" }}>
            <input
              type="checkbox"
              checked={batchSkipScrape}
              onChange={(e) => setBatchSkipScrape(e.target.checked)}
            />
            Skip Firecrawl for every target in this batch (faster)
          </label>
          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="batchConcurrency" style={{ fontSize: 14, fontWeight: 600 }}>
              Concurrency (in-flight at once, 1–50)
            </label>
            <input
              id="batchConcurrency"
              type="number"
              min={1}
              max={50}
              value={batchConcurrency}
              onChange={(e) => setBatchConcurrency(Number(e.target.value))}
              style={{
                maxWidth: 120,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #d7d7d7",
                fontSize: 14,
              }}
            />
            <p style={{ margin: 0, fontSize: 12, color: "#7c3aed" }}>
              Default 10. Higher = faster, more load on OpenAI / Firecrawl. Turn down if you see rate errors.
            </p>
          </div>
          <button
            type="button"
            disabled={batchRunning}
            onClick={() => void runBatch50()}
            style={{
              justifySelf: "start",
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #6d28d9",
              background: batchRunning ? "#c4b5fd" : "#7c3aed",
              color: "white",
              fontSize: 14,
              fontWeight: 600,
              cursor: batchRunning ? "wait" : "pointer",
            }}
          >
            {batchRunning
              ? `Running… ${batchProgress.done}/${batchProgress.total}`
              : "Run outreach + rank on up to 50 businesses"}
          </button>
        </div>

        {batchError ? (
          <pre
            style={{
              margin: "12px 0 0",
              padding: 10,
              borderRadius: 8,
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              color: "#881337",
              fontSize: 13,
              whiteSpace: "pre-wrap",
            }}
          >
            {batchError}
          </pre>
        ) : null}

        {batchLog.length > 0 ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Progress log</div>
            <div
              style={{
                maxHeight: 220,
                overflow: "auto",
                fontSize: 12,
                lineHeight: 1.5,
                padding: 10,
                background: "white",
                border: "1px solid #e9d5ff",
                borderRadius: 8,
              }}
            >
              {batchLog.map((line, i) => (
                <div key={i} style={{ color: line.ok ? "#166534" : "#b91c1c" }}>
                  {line.ok ? "✓" : "✗"} {line.name}
                  {line.ok && line.rank != null ? ` — rank ${line.rank}/10` : ""}
                  {!line.ok && line.error ? ` — ${line.error}` : ""}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>
        Single target (below) is still available for one-off tests.
      </p>

      <form action={formAction} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <label htmlFor="targetBusinessId" style={{ fontSize: 14, fontWeight: 600 }}>
            Target business ID (UUID)
          </label>
          <input
            id="targetBusinessId"
            name="targetBusinessId"
            type="text"
            required
            placeholder="e.g. from the discovery table — id column"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #d7d7d7",
              fontSize: 14,
            }}
          />
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, color: "#475569" }}>
          <input type="checkbox" name="skipScrape" />
          Skip Firecrawl (faster; uses Places + source profile only)
        </label>
        <button
          type="submit"
          style={{
            justifySelf: "start",
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #7c3aed",
            background: "#7c3aed",
            color: "white",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Run outreach + rank (single)
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

      {state && state.ok && p ? (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: 12,
              borderRadius: 10,
              background: "#f5f3ff",
              border: "1px solid #ddd6fe",
            }}
          >
            <span style={{ fontSize: 14, color: "#5b21b6" }}>Partnership fit</span>
            <span style={{ fontSize: 28, fontWeight: 800, color: "#4c1d95" }}>{rank ?? p.rank1to10 ?? "—"}</span>
            <span style={{ fontSize: 13, color: "#6d28d9" }}>/ 10</span>
          </div>

          {p.matchReasons && p.matchReasons.length > 0 ? (
            <div>
              <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Why it fits</h3>
              <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.5, color: "#334155" }}>
                {p.matchReasons.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {p.risks && p.risks.length > 0 ? (
            <div>
              <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Risks / gaps</h3>
              <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.5, color: "#b45309" }}>
                {p.risks.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {p.targetProfile ? (
            <div>
              <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Target read</h3>
              <p style={{ margin: 0, lineHeight: 1.6, color: "#334155" }}>{p.targetProfile.summary}</p>
            </div>
          ) : null}

          {p.personalizationAnchors && p.personalizationAnchors.length > 0 ? (
            <div>
              <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Anchors</h3>
              <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.5, color: "#334155", fontSize: 14 }}>
                {p.personalizationAnchors.map((a, i) => (
                  <li key={i}>
                    {a.fact}{" "}
                    <a href={a.sourceUrl} target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>
                      (source)
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {p.emailDraft ? (
            <div
              style={{
                padding: 14,
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                background: "#f8fafc",
              }}
            >
              <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Draft email</h3>
              <p style={{ margin: "0 0 8px", fontSize: 12, color: "#64748b" }}>Subject options</p>
              <ul style={{ margin: "0 0 12px", paddingLeft: 20 }}>
                {p.emailDraft.subjectOptions.map((s, i) => (
                  <li key={i} style={{ color: "#0f172a" }}>
                    {s}
                  </li>
                ))}
              </ul>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: "#64748b" }}>Body</p>
              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  fontSize: 14,
                  lineHeight: 1.55,
                  fontFamily: "ui-sans-serif, system-ui, sans-serif",
                  color: "#1e293b",
                }}
              >
                {p.emailDraft.body}
              </pre>
            </div>
          ) : null}

          <details
            style={{
              padding: 12,
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              background: "#fafafa",
            }}
          >
            <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#475569" }}>
              Raw API JSON
            </summary>
            <pre
              style={{
                margin: "12px 0 0",
                fontSize: 11,
                lineHeight: 1.4,
                overflow: "auto",
                maxHeight: 360,
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
