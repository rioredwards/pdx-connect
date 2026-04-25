"use client";

import { useCallback, useState } from "react";

import {
  analyzeTargetsBatchAction,
  discoverTargetsAction,
  listProjectTargetsAction,
  scrapeWebsiteAction,
} from "../actions";
import type { SampleBusiness } from "@/lib/sample-businesses";
import type { AnalysisResult } from "../actions";

type StepScrape = {
  step: "scrape";
  clientRequestMs: number;
  view: NonNullable<Extract<Awaited<ReturnType<typeof scrapeWebsiteAction>>, { ok: true }>["view"]>;
};

type StepDiscover = {
  step: "discover";
  clientRequestMs: number;
  projectId: string;
  inserted: number;
  serverTimings?: { discoverEdgeMs?: number };
};

type StepList = {
  step: "list";
  clientRequestMs: number;
  count: number;
};

type TargetRow =
  | {
      ok: true;
      name: string;
      targetBusinessId: string;
      clientRequestMs: number;
      result: AnalysisResult;
    }
  | {
      ok: false;
      name: string;
      targetBusinessId: string;
      clientRequestMs: number;
      error: string;
    };

type RunState =
  | { status: "idle" }
  | { status: "running"; label: string }
  | { status: "error"; message: string }
  | {
      status: "done";
      sampleName: string;
      scrape: StepScrape;
      discover: StepDiscover;
      list: StepList;
      targetFirecrawl: boolean;
      /** How many analyze_target server actions ran at the same time (capped) */
      analyzeConcurrency: number;
      /** Server-side wall time across the whole parallel batch (Node fanout to edge) */
      analyzeBatchWallMs: number;
      /** Browser wall time for the single batch server action (network + server) */
      clientBatchWallMs: number;
      targets: TargetRow[];
    };

const MS = (n: number | undefined) => (n == null || Number.isNaN(n) ? "—" : `${n} ms`);

export function E2eTestWorkflow({ samples }: { samples: SampleBusiness[] }) {
  const [sampleId, setSampleId] = useState(samples[0]?.id ?? "");
  const [targetCount, setTargetCount] = useState(3);
  const [targetFirecrawl, setTargetFirecrawl] = useState(true);
  const [openAiModel, setOpenAiModel] = useState("gpt-5.4-nano");
  const [textVerbosity, setTextVerbosity] = useState<"low" | "medium" | "">("low");
  const [state, setState] = useState<RunState>({ status: "idle" });

  const run = useCallback(async () => {
    const sample = samples.find((s) => s.id === sampleId);
    if (!sample) {
      setState({ status: "error", message: "Select a sample business." });
      return;
    }
    const n = Math.min(10, Math.max(1, Math.floor(targetCount) || 1));

    setState({ status: "running", label: "1. Scraping source site…" });

    const tSc0 = performance.now();
    const fdS = new FormData();
    fdS.set("url", sample.website_url);
    const sc = await scrapeWebsiteAction(null, fdS);
    const scrapeClientMs = Math.round(performance.now() - tSc0);

    if (!sc.ok) {
      setState({ status: "error", message: sc.error });
      return;
    }
    if (!sc.view.projectId) {
      setState({ status: "error", message: "Scrape did not return a project id." });
      return;
    }

    setState({ status: "running", label: "2. Discovering local targets (Places)…" });

    const tD0 = performance.now();
    const fdD = new FormData();
    fdD.set("projectId", sc.view.projectId);
    const disc = await discoverTargetsAction(null, fdD);
    const discoverClientMs = Math.round(performance.now() - tD0);

    if (!disc.ok) {
      setState({ status: "error", message: disc.error });
      return;
    }

    setState({ status: "running", label: "3. Listing targets…" });

    const tL0 = performance.now();
    const list = await listProjectTargetsAction(sc.view.projectId, false, n);
    const listClientMs = Math.round(performance.now() - tL0);

    if (!list.ok) {
      setState({ status: "error", message: list.error });
      return;
    }
    if (list.targets.length === 0) {
      setState({
        status: "error",
        message: "No targets for this project. Try discover again or pick another sample.",
      });
      return;
    }

    const take = list.targets.slice(0, n);
    const conc = take.length;
    setState({
      status: "running",
      label: `4. Analyzing ${take.length} targets in true parallel (single batch action, ${conc} concurrent edge calls)…`,
    });

    const tBatch0 = performance.now();
    const batch = await analyzeTargetsBatchAction(
      take.map((t) => ({ targetBusinessId: t.id, name: t.name })),
      {
        skipScrape: !targetFirecrawl,
        openAiModel: openAiModel.trim() || undefined,
        textVerbosity:
          textVerbosity === "low" || textVerbosity === "medium" ? textVerbosity : undefined,
      },
    );
    const clientBatchWallMs = Math.round(performance.now() - tBatch0);

    if (!batch.ok) {
      setState({ status: "error", message: batch.error });
      return;
    }

    const targetRows: TargetRow[] = batch.items.map((it) =>
      it.ok
        ? {
            ok: true as const,
            name: it.name,
            targetBusinessId: it.targetBusinessId,
            clientRequestMs: it.clientRequestMs,
            result: it.result,
          }
        : {
            ok: false as const,
            name: it.name,
            targetBusinessId: it.targetBusinessId,
            clientRequestMs: it.clientRequestMs,
            error: it.error,
          },
    );
    const analyzeBatchWallMs = batch.batchWallMs;

    setState({
      status: "done",
      sampleName: sample.name,
      targetFirecrawl,
      analyzeConcurrency: conc,
      analyzeBatchWallMs,
      clientBatchWallMs,
      scrape: {
        step: "scrape",
        clientRequestMs: scrapeClientMs,
        view: { ...sc.view, clientRequestMs: scrapeClientMs },
      },
      discover: {
        step: "discover",
        clientRequestMs: discoverClientMs,
        projectId: disc.summary.projectId,
        inserted: disc.summary.inserted,
        serverTimings: disc.summary.serverTimings,
      },
      list: { step: "list", clientRequestMs: listClientMs, count: list.targets.length },
      targets: targetRows,
    });
  }, [sampleId, samples, targetCount, targetFirecrawl, openAiModel, textVerbosity]);

  const currentSample = samples.find((s) => s.id === sampleId);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div
        style={{
          display: "grid",
          gap: 14,
          padding: 16,
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          background: "#fafafa",
        }}
      >
        <div style={{ display: "grid", gap: 6 }}>
          <label htmlFor="e2eSample" style={{ fontWeight: 600, fontSize: 14 }}>
            Sample project (source business)
          </label>
          <select
            id="e2eSample"
            value={sampleId}
            onChange={(e) => setSampleId(e.target.value)}
            style={{ maxWidth: 480, padding: "10px 12px", borderRadius: 10, fontSize: 14 }}
          >
            {samples.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.website_url}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "end" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="e2eN" style={{ fontWeight: 600, fontSize: 14 }}>
              Target rows to analyze (closest first)
            </label>
            <input
              id="e2eN"
              type="number"
              min={1}
              max={10}
              value={targetCount}
              onChange={(e) => setTargetCount(Number(e.target.value))}
              style={{ width: 100, padding: "8px 10px", borderRadius: 10 }}
            />
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={targetFirecrawl}
              onChange={(e) => setTargetFirecrawl(e.target.checked)}
            />
            <span>
              <strong>Target Firecrawl</strong> (off = skip scrape, listing + source profile only; fastest)
            </span>
          </label>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "end" }}>
          <div style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>OpenAI model</span>
            <input
              value={openAiModel}
              onChange={(e) => setOpenAiModel(e.target.value)}
              style={{ minWidth: 200, padding: "8px 10px", borderRadius: 10, fontSize: 14 }}
            />
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Verbosity</span>
            <select
              value={textVerbosity}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || v === "low" || v === "medium") setTextVerbosity(v);
              }}
              style={{ padding: "8px 10px", borderRadius: 10 }}
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="">default (env)</option>
            </select>
          </div>
        </div>

        <button
          type="button"
          disabled={state.status === "running" || !sampleId}
          onClick={() => void run()}
          style={{
            justifySelf: "start",
            padding: "12px 18px",
            borderRadius: 10,
            border: "1px solid #5b21b6",
            background: state.status === "running" ? "#c4b5fd" : "#7c3aed",
            color: "white",
            fontWeight: 600,
            cursor: state.status === "running" ? "wait" : "pointer",
            fontSize: 15,
          }}
        >
          {state.status === "running" ? state.label : "Run end-to-end workflow"}
        </button>
        {state.status === "running" ? (
          <p style={{ margin: 0, fontSize: 14, color: "#64748b" }}>{state.label}</p>
        ) : null}
      </div>

      {state.status === "error" ? (
        <pre
          style={{
            margin: 0,
            padding: 12,
            background: "#fff1f2",
            border: "1px solid #fecdd3",
            borderRadius: 10,
            color: "#9f1239",
            fontSize: 14,
            whiteSpace: "pre-wrap",
          }}
        >
          {state.message}
        </pre>
      ) : null}

      {state.status === "done" ? (
        <E2eResults
          state={state}
          websiteUrl={currentSample?.website_url ?? ""}
        />
      ) : null}
    </div>
  );
}

function E2eResults({
  state,
  websiteUrl,
}: {
  state: Extract<RunState, { status: "done" }>;
  websiteUrl: string;
}) {
  const v = state.scrape.view;
  const st = v.serverTimings;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section>
        <h2 style={{ margin: "0 0 8px", fontSize: 18, color: "#0f172a" }}>Timings (server vs round-trip)</h2>
        <p style={{ margin: "0 0 12px", fontSize: 14, color: "#64748b" }}>
          <strong>Server</strong> = edge function work (per segment). <strong>Client RTT</strong> = full Next.js server
          action + network + edge (wall clock from your browser). Step 4 sends <strong>one batch server action</strong>{" "}
          that fans out to <code style={{ fontSize: 12 }}>analyze_target</code> in parallel from Node.js — bypassing the
          Server Action queue, so the batch wall time is roughly the slowest single edge call, not the sum.
        </p>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 14,
              background: "white",
              border: "1px solid #e2e8f0",
            }}
          >
            <thead>
              <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                <th style={{ padding: 10, borderBottom: "1px solid #e2e8f0" }}>Step</th>
                <th style={{ padding: 10, borderBottom: "1px solid #e2e8f0" }}>Server (segmented)</th>
                <th style={{ padding: 10, borderBottom: "1px solid #e2e8f0" }}>Client RTT</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>1. Source — Firecrawl (multi-page)</td>
                <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>{MS(st?.sourceFirecrawlMs)}</td>
                <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", verticalAlign: "top" }} rowSpan={3}>
                  {MS(v.clientRequestMs)}
                </td>
              </tr>
              <tr>
                <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>1. Source — OpenAI profile extract</td>
                <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>{MS(st?.sourceOpenAiMs)}</td>
              </tr>
              <tr>
                <td style={{ padding: 10, borderBottom: "1px solid #e2e8f0" }}>1. Source — edge (full handler)</td>
                <td style={{ padding: 10, borderBottom: "1px solid #e2e8f0" }}>{MS(st?.sourceEdgeMs)}</td>
              </tr>
              <tr>
                <td style={{ padding: 10, borderBottom: "1px solid #e2e8f0" }}>2. Discover (Places + upsert)</td>
                <td style={{ padding: 10, borderBottom: "1px solid #e2e8f0" }}>
                  {MS(state.discover.serverTimings?.discoverEdgeMs)}
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid #e2e8f0" }}>
                  {MS(state.discover.clientRequestMs)}
                </td>
              </tr>
              <tr>
                <td style={{ padding: 10, borderBottom: "1px solid #e2e8f0" }}>3. List targets (PostgREST)</td>
                <td style={{ padding: 10, borderBottom: "1px solid #e2e8f0" }}>—</td>
                <td style={{ padding: 10, borderBottom: "1px solid #e2e8f0" }}>{MS(state.list.clientRequestMs)}</td>
              </tr>
              <tr>
                <td style={{ padding: 10 }}>
                  4. Analyze batch — <strong>{state.analyzeConcurrency} parallel</strong>{" "}
                  <code style={{ fontSize: 12 }}>analyze_target</code>
                </td>
                <td style={{ padding: 10 }}>
                  <strong>{MS(state.analyzeBatchWallMs)}</strong> Node fanout wall · see each target below
                </td>
                <td style={{ padding: 10 }}>
                  <strong>{MS(state.clientBatchWallMs)}</strong> single batch action
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
        Project <code style={{ fontSize: 12 }}>{state.discover.projectId}</code> · source{" "}
        <code style={{ fontSize: 12 }}>{websiteUrl}</code> · discover inserted {state.discover.inserted} · listed{" "}
        {state.list.count} (analyzing {state.targets.length} in parallel) · target Firecrawl:{" "}
        <strong>{state.targetFirecrawl ? "on" : "off"}</strong>
      </p>

      <h2 style={{ margin: 0, fontSize: 18, color: "#0f172a" }}>Outreach and ranking (per target)</h2>
      <p style={{ margin: "4px 0 16px", fontSize: 14, color: "#475569", lineHeight: 1.5 }}>
        <span
          style={{
            display: "inline-block",
            marginRight: 8,
            padding: "2px 8px",
            borderRadius: 6,
            background: "#ede9fe",
            color: "#5b21b6",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Parallel ×{state.analyzeConcurrency}
        </span>
        All targets were analyzed together via a <strong>single batch server action</strong> that fans out from Node.js
        in parallel. Server-side batch wall: <strong>{MS(state.analyzeBatchWallMs)}</strong>. Browser-side wall (incl.
        round-trip): <strong>{MS(state.clientBatchWallMs)}</strong>. Per-target client RTT below is what each individual
        edge call took on the server (not a separate browser round-trip).
      </p>
      {state.targets.map((row) => {
        if (!row.ok) {
          return (
            <article
              key={row.targetBusinessId}
              style={{
                border: "1px solid #fecdd3",
                borderRadius: 12,
                padding: 16,
                background: "#fff1f2",
              }}
            >
              <h3 style={{ margin: "0 0 8px", fontSize: 17, color: "#0f172a" }}>{row.name}</h3>
              <p style={{ margin: 0, fontSize: 14, color: "#9f1239" }}>
                <strong>Error</strong> (after {MS(row.clientRequestMs)}): {row.error}
              </p>
            </article>
          );
        }
        const p = row.result.analysis.payload;
        const stt = row.result.serverTimings;
        return (
          <article
            key={row.targetBusinessId}
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: 16,
              background: "white",
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                gap: 8,
                marginBottom: 12,
                alignItems: "baseline",
              }}
            >
              <h3 style={{ margin: 0, fontSize: 17, color: "#0f172a" }}>{row.name}</h3>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#5b21b6" }}>
                Fit rank {row.result.analysis.rank_1_to_10 ?? p.rank1to10 ?? "—"}/10
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: 8,
                marginBottom: 12,
                fontSize: 13,
                color: "#475569",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, color: "#64748b" }}>Client RTT (this target)</div>
                {MS(row.clientRequestMs)}
              </div>
              <div>
                <div style={{ fontWeight: 600, color: "#64748b" }}>Target site Firecrawl</div>
                {MS(stt?.targetSiteFirecrawlMs)}
              </div>
              <div>
                <div style={{ fontWeight: 600, color: "#64748b" }}>OpenAI — outreach</div>
                {MS(stt?.outreachOpenAiMs)}
              </div>
              <div>
                <div style={{ fontWeight: 600, color: "#64748b" }}>OpenAI — rank</div>
                {MS(stt?.rankOpenAiMs)}
              </div>
              <div>
                <div style={{ fontWeight: 600, color: "#64748b" }}>Target edge (total)</div>
                {MS(stt?.targetEdgeMs)}
              </div>
            </div>
            {p.targetProfile ? (
              <p style={{ margin: "0 0 8px", fontSize: 14, lineHeight: 1.5 }}>
                <strong>Target profile:</strong> {p.targetProfile.summary}
              </p>
            ) : null}
            {p.personalizationAnchors && p.personalizationAnchors.length > 0 ? (
              <ul style={{ margin: "0 0 10px", paddingLeft: 20, fontSize: 14 }}>
                {p.personalizationAnchors.map((a, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    {a.fact} <span style={{ color: "#94a3b8" }}>({a.sourceUrl})</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {p.emailDraft ? (
              <div
                style={{
                  marginBottom: 10,
                  padding: 12,
                  background: "#f8fafc",
                  borderRadius: 8,
                  fontSize: 14,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Subject options</div>
                <ul style={{ margin: "0 0 8px", paddingLeft: 20 }}>
                  {p.emailDraft.subjectOptions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Body</div>
                <pre
                  style={{
                    margin: 0,
                    fontFamily: "ui-sans-serif, system-ui, sans-serif",
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.55,
                  }}
                >
                  {p.emailDraft.body}
                </pre>
              </div>
            ) : null}
            {p.matchReasons && p.matchReasons.length > 0 ? (
              <div style={{ fontSize: 14, marginBottom: 6 }}>
                <strong>Match</strong>
                <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                  {p.matchReasons.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {p.risks && p.risks.length > 0 ? (
              <div style={{ fontSize: 14 }}>
                <strong>Risks</strong>
                <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                  {p.risks.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
