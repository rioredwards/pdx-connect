"use client";

import type * as React from "react";
import { useCallback, useMemo, useState } from "react";

import {
  analyzeTargetsBatchAction,
  discoverTargetsAction,
  listProjectTargetsAction,
  scrapeWebsiteAction,
} from "../actions";
import type { AnalysisResult } from "../actions";
import type { SampleBusiness } from "@/lib/sample-businesses";

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function faviconUrl(url: string, size = 128): string {
  const d = domainOf(url);
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=${size}`;
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function friendlyDomain(url: string): string {
  return domainOf(url);
}

type Phase = "idle" | "studying" | "searching" | "shortlisting" | "drafting" | "done" | "error";

type StepKey = "studying" | "searching" | "shortlisting" | "drafting";

type Partner =
  | {
      ok: true;
      name: string;
      targetBusinessId: string;
      result: AnalysisResult;
    }
  | {
      ok: false;
      name: string;
      targetBusinessId: string;
      error: string;
    };

type DoneState = {
  status: "done";
  sourceName: string;
  sourceUrl: string;
  partnersAnalyzed: number;
  totalElapsedMs: number;
  fastMode: boolean;
  partners: Partner[];
};

type RunState =
  | { status: "idle" }
  | {
      status: "running";
      phase: Phase;
      stepDurations: Partial<Record<StepKey, number>>;
    }
  | { status: "error"; message: string }
  | DoneState;

const STEPS: { key: StepKey; label: string; sub: string }[] = [
  { key: "studying", label: "Studying your business", sub: "Reading the website to understand what you do" },
  { key: "searching", label: "Searching the neighborhood", sub: "Finding nearby businesses worth reaching out to" },
  { key: "shortlisting", label: "Picking the shortlist", sub: "Ranking by proximity and signal" },
  { key: "drafting", label: "Drafting personalized intros", sub: "Reading each partner site and writing one email per match" },
];

const fitBucket = (rank: number | null | undefined) => {
  const r = rank ?? 0;
  if (r >= 9) return { label: "Excellent fit", bg: "#10b981", fg: "white", soft: "#d1fae5" };
  if (r >= 7) return { label: "Strong fit", bg: "#0ea5e9", fg: "white", soft: "#e0f2fe" };
  if (r >= 5) return { label: "Possible fit", bg: "#f59e0b", fg: "white", soft: "#fef3c7" };
  return { label: "Long shot", bg: "#94a3b8", fg: "white", soft: "#f1f5f9" };
};

function fmtSeconds(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

type SourceMode = "sample" | "custom";

export function PartnerFinderDemo({ samples }: { samples: SampleBusiness[] }) {
  const [mode, setMode] = useState<SourceMode>("sample");
  const [sampleId, setSampleId] = useState(samples[0]?.id ?? "");
  const [customUrl, setCustomUrl] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [partnerCount, setPartnerCount] = useState(10);
  const [fastMode, setFastMode] = useState(false);
  const [state, setState] = useState<RunState>({ status: "idle" });

  const currentSample = useMemo(
    () => samples.find((s) => s.id === sampleId),
    [samples, sampleId],
  );

  const customUrlNormalized = useMemo(() => normalizeUrl(customUrl), [customUrl]);
  const canRunCustom = mode === "custom" && customUrlNormalized != null;
  const canRunSample = mode === "sample" && Boolean(currentSample);
  const canRun = canRunSample || canRunCustom;

  const run = useCallback(async () => {
    let sourceUrl: string;
    let sourceLabel: string;
    let userHint = "";

    if (mode === "sample") {
      if (!currentSample) {
        setState({ status: "error", message: "Pick a business to get started." });
        return;
      }
      sourceUrl = currentSample.website_url;
      sourceLabel = currentSample.name;
    } else {
      if (!customUrlNormalized) {
        setState({ status: "error", message: "Enter a valid website URL (https://...)." });
        return;
      }
      sourceUrl = customUrlNormalized;
      sourceLabel = friendlyDomain(customUrlNormalized);
      userHint = customDescription.trim().slice(0, 800);
    }

    const n = Math.min(30, Math.max(1, Math.floor(partnerCount) || 1));
    const stepDurations: Partial<Record<StepKey, number>> = {};
    const tAll = performance.now();

    setState({ status: "running", phase: "studying", stepDurations: { ...stepDurations } });

    const t1 = performance.now();
    const fdS = new FormData();
    fdS.set("url", sourceUrl);
    if (userHint) fdS.set("userHint", userHint);
    const sc = await scrapeWebsiteAction(null, fdS);
    if (!sc.ok) {
      setState({ status: "error", message: sc.error });
      return;
    }
    if (!sc.view.projectId) {
      setState({ status: "error", message: "Could not open a project for this business." });
      return;
    }
    stepDurations.studying = Math.round(performance.now() - t1);

    setState({ status: "running", phase: "searching", stepDurations: { ...stepDurations } });

    const t2 = performance.now();
    const fdD = new FormData();
    fdD.set("projectId", sc.view.projectId);
    const disc = await discoverTargetsAction(null, fdD);
    if (!disc.ok) {
      setState({ status: "error", message: disc.error });
      return;
    }
    stepDurations.searching = Math.round(performance.now() - t2);

    setState({ status: "running", phase: "shortlisting", stepDurations: { ...stepDurations } });

    const t3 = performance.now();
    const list = await listProjectTargetsAction(sc.view.projectId, false, n);
    if (!list.ok) {
      setState({ status: "error", message: list.error });
      return;
    }
    if (list.targets.length === 0) {
      setState({ status: "error", message: "We couldn’t find any nearby partners. Try a different sample." });
      return;
    }
    stepDurations.shortlisting = Math.round(performance.now() - t3);

    const take = list.targets.slice(0, n);

    setState({ status: "running", phase: "drafting", stepDurations: { ...stepDurations } });

    const t4 = performance.now();
    const batch = await analyzeTargetsBatchAction(
      take.map((t) => ({ targetBusinessId: t.id, name: t.name })),
      {
        skipScrape: fastMode,
        textVerbosity: "low",
      },
    );
    if (!batch.ok) {
      setState({ status: "error", message: batch.error });
      return;
    }
    stepDurations.drafting = Math.round(performance.now() - t4);

    const partners: Partner[] = batch.items.map((it) =>
      it.ok
        ? {
            ok: true as const,
            name: it.name,
            targetBusinessId: it.targetBusinessId,
            result: it.result,
          }
        : {
            ok: false as const,
            name: it.name,
            targetBusinessId: it.targetBusinessId,
            error: it.error,
          },
    );

    partners.sort((a, b) => {
      const ra = a.ok ? a.result.analysis.rank_1_to_10 ?? a.result.analysis.payload.rank1to10 ?? -1 : -1;
      const rb = b.ok ? b.result.analysis.rank_1_to_10 ?? b.result.analysis.payload.rank1to10 ?? -1 : -1;
      return rb - ra;
    });

    setState({
      status: "done",
      sourceName: sourceLabel,
      sourceUrl,
      partnersAnalyzed: partners.length,
      totalElapsedMs: Math.round(performance.now() - tAll),
      fastMode,
      partners,
    });
  }, [mode, currentSample, customUrlNormalized, customDescription, partnerCount, fastMode]);

  const isRunning = state.status === "running";

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section
        style={{
          background: "white",
          border: "1px solid rgba(124, 58, 237, 0.15)",
          borderRadius: 18,
          padding: 24,
          boxShadow: "0 14px 30px -22px rgba(76, 29, 149, 0.45)",
          boxSizing: "border-box",
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 12,
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
            Choose a starting point
          </h2>
          <ModeTabs mode={mode} onChange={setMode} disabled={isRunning} />
        </div>

        {mode === "sample" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 10,
              marginBottom: 20,
            }}
          >
            {samples.map((s) => (
              <BusinessTile
                key={s.id}
                sample={s}
                selected={sampleId === s.id}
                disabled={isRunning}
                onSelect={() => setSampleId(s.id)}
              />
            ))}
          </div>
        ) : (
          <CustomBusinessForm
            url={customUrl}
            description={customDescription}
            onUrlChange={setCustomUrl}
            onDescriptionChange={setCustomDescription}
            disabled={isRunning}
            normalized={customUrlNormalized}
          />
        )}

        <div
          style={{
            display: "grid",
            gap: 14,
            gridTemplateColumns: "minmax(0, 1fr) minmax(140px, 200px)",
            alignItems: "end",
          }}
        >
          <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
            <label htmlFor="pfFastMode" style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>
              Mode
            </label>
            <label
              htmlFor="pfFastMode"
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                fontSize: 14,
                color: "#475569",
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid #e2e8f0",
                background: isRunning ? "#f8fafc" : "white",
                cursor: isRunning ? "not-allowed" : "pointer",
                boxSizing: "border-box",
                minWidth: 0,
              }}
            >
              <input
                id="pfFastMode"
                type="checkbox"
                checked={fastMode}
                onChange={(e) => setFastMode(e.target.checked)}
                disabled={isRunning}
                style={{ width: 16, height: 16, flexShrink: 0 }}
              />
              <span style={{ minWidth: 0 }}>
                <strong>Fast preview</strong> — skip reading each partner’s site (much quicker)
              </span>
            </label>
          </div>

          <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
            <label htmlFor="pfCount" style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>
              How many partners
            </label>
            <input
              id="pfCount"
              type="number"
              min={1}
              max={30}
              value={partnerCount}
              onChange={(e) => setPartnerCount(Number(e.target.value))}
              disabled={isRunning}
              style={{
                width: "100%",
                padding: "12px 14px",
                fontSize: 16,
                borderRadius: 12,
                border: "1px solid #e2e8f0",
                background: isRunning ? "#f8fafc" : "white",
                boxSizing: "border-box",
                minWidth: 0,
              }}
            />
          </div>
        </div>

        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={() => void run()}
            disabled={isRunning || !canRun}
            style={{
              padding: "14px 22px",
              borderRadius: 12,
              border: "none",
              fontWeight: 700,
              fontSize: 16,
              cursor: isRunning || !canRun ? "not-allowed" : "pointer",
              background: isRunning || !canRun
                ? "#c4b5fd"
                : "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
              color: "white",
              boxShadow: isRunning || !canRun ? "none" : "0 12px 24px -12px rgba(79, 70, 229, 0.6)",
              transition: "transform 0.1s",
            }}
          >
            {isRunning
              ? "Working on it…"
              : mode === "sample"
                ? currentSample
                  ? `Find partners for ${currentSample.name}`
                  : "Find partners"
                : customUrlNormalized
                  ? `Find partners for ${friendlyDomain(customUrlNormalized)}`
                  : "Enter a website URL"}
          </button>
        </div>
      </section>

      {state.status === "running" ? <ProgressStepper phase={state.phase} durations={state.stepDurations} /> : null}

      {state.status === "error" ? (
        <div
          style={{
            background: "#fff1f2",
            border: "1px solid #fecdd3",
            color: "#9f1239",
            borderRadius: 14,
            padding: 16,
            fontSize: 15,
          }}
        >
          {state.message}
        </div>
      ) : null}

      {state.status === "done" ? <Results state={state} /> : null}

      <TechWall />
    </div>
  );
}

function ProgressStepper({
  phase,
  durations,
}: {
  phase: Phase;
  durations: Partial<Record<StepKey, number>>;
}) {
  const order: StepKey[] = ["studying", "searching", "shortlisting", "drafting"];
  const currentIdx = order.indexOf(phase as StepKey);

  return (
    <section
      style={{
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: 18,
        padding: 22,
        boxShadow: "0 10px 24px -22px rgba(15, 23, 42, 0.4)",
      }}
    >
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 14 }}>
        {STEPS.map((step, idx) => {
          const isDone = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          const dur = durations[step.key];
          return (
            <li key={step.key} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <StepDot done={isDone} active={isCurrent} />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 15,
                    color: isDone || isCurrent ? "#0f172a" : "#94a3b8",
                  }}
                >
                  {step.label}
                  {dur != null ? (
                    <span style={{ marginLeft: 10, fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>
                      {fmtSeconds(dur)}
                    </span>
                  ) : null}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: isCurrent ? "#475569" : "#94a3b8",
                    marginTop: 2,
                  }}
                >
                  {step.sub}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function StepDot({ done, active }: { done: boolean; active: boolean }) {
  if (done) {
    return (
      <div
        aria-hidden
        style={{
          width: 26,
          height: 26,
          borderRadius: 999,
          background: "#10b981",
          color: "white",
          display: "grid",
          placeItems: "center",
          fontSize: 14,
          flexShrink: 0,
        }}
      >
        ✓
      </div>
    );
  }
  if (active) {
    return (
      <div
        aria-hidden
        style={{
          width: 26,
          height: 26,
          borderRadius: 999,
          border: "2px solid #7c3aed",
          flexShrink: 0,
          position: "relative",
          animation: "pf-pulse 1.4s ease-in-out infinite",
        }}
      >
        <style>{`
          @keyframes pf-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(124, 58, 237, 0.5); }
            50% { box-shadow: 0 0 0 8px rgba(124, 58, 237, 0); }
          }
        `}</style>
      </div>
    );
  }
  return (
    <div
      aria-hidden
      style={{
        width: 26,
        height: 26,
        borderRadius: 999,
        border: "2px solid #e2e8f0",
        flexShrink: 0,
      }}
    />
  );
}

function Results({ state }: { state: DoneState }) {
  const successCount = state.partners.filter((p) => p.ok).length;

  return (
    <section style={{ display: "grid", gap: 18 }}>
      <div
        style={{
          background: "linear-gradient(135deg, #f5f3ff 0%, #eff6ff 100%)",
          border: "1px solid rgba(124, 58, 237, 0.15)",
          borderRadius: 18,
          padding: 20,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 14, color: "#5b21b6", fontWeight: 600 }}>Partners for {state.sourceName}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginTop: 4 }}>
            {successCount} match{successCount === 1 ? "" : "es"} ready to reach out
          </div>
        </div>
        <div style={{ display: "flex", gap: 18, fontSize: 13, color: "#475569" }}>
          <Stat label="Time" value={fmtSeconds(state.totalElapsedMs)} />
          <Stat label="Mode" value={state.fastMode ? "Fast preview" : "Deep read"} />
        </div>
      </div>

      <PartnersTable partners={state.partners} />
    </section>
  );
}

function PartnersTable({ partners }: { partners: Partner[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allOpen = expanded.size === partners.length && partners.length > 0;
  const setAll = useCallback(
    (open: boolean) => {
      setExpanded(open ? new Set(partners.map((p) => p.targetBusinessId)) : new Set());
    },
    [partners],
  );

  return (
    <div
      style={{
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 12px 30px -24px rgba(15, 23, 42, 0.4)",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          background: "#f8fafc",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", letterSpacing: 0.4, textTransform: "uppercase" }}>
          Ranked partners
        </div>
        <button
          type="button"
          onClick={() => setAll(!allOpen)}
          style={{
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            padding: "5px 10px",
            fontSize: 12,
            fontWeight: 600,
            color: "#475569",
            cursor: "pointer",
          }}
        >
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <colgroup>
            <col style={{ width: 48 }} />
            <col style={{ width: 220 }} />
            <col style={{ width: 116 }} />
            <col />
            <col style={{ width: 44 }} />
          </colgroup>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
              <Th>#</Th>
              <Th>Partner</Th>
              <Th>Fit</Th>
              <Th>Summary</Th>
              <Th aria-label="Toggle" />
            </tr>
          </thead>
          <tbody>
            {partners.map((p, idx) => (
              <PartnerRow
                key={p.targetBusinessId}
                partner={p}
                index={idx}
                isOpen={expanded.has(p.targetBusinessId)}
                onToggle={() => toggle(p.targetBusinessId)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, ...rest }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...rest}
      style={{
        padding: "10px 14px",
        textAlign: "left",
        fontSize: 11,
        color: "#64748b",
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: "uppercase",
      }}
    >
      {children}
    </th>
  );
}

function PartnerRow({
  partner,
  index,
  isOpen,
  onToggle,
}: {
  partner: Partner;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const errored = !partner.ok;
  const a = partner.ok ? partner.result.analysis : null;
  const p = a?.payload;
  const rank = a?.rank_1_to_10 ?? p?.rank1to10 ?? null;
  const bucket = fitBucket(rank);
  const summary = p?.targetProfile?.summary ?? (errored ? partner.error : "");

  const rowBg = isOpen ? "#f8fafc" : "white";
  const cellStyle: React.CSSProperties = {
    padding: "16px 18px",
    borderTop: index === 0 ? "none" : "1px solid #f1f5f9",
    verticalAlign: "top",
    background: rowBg,
  };

  return (
    <>
      <tr
        onClick={onToggle}
        style={{ cursor: "pointer" }}
        aria-expanded={isOpen}
      >
        <td style={{ ...cellStyle, color: "#94a3b8", fontWeight: 700, fontSize: 13, paddingTop: 18 }}>
          {String(index + 1).padStart(2, "0")}
        </td>
        <td style={{ ...cellStyle, color: "#0f172a", fontWeight: 600, paddingTop: 16 }}>
          <div
            style={{
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: 14,
            }}
            title={partner.name}
          >
            {partner.name}
          </div>
        </td>
        <td style={{ ...cellStyle, paddingTop: 14 }}>
          {errored ? (
            <span style={{ fontSize: 12, color: "#9f1239", fontWeight: 600 }}>Failed</span>
          ) : (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 999,
                background: bucket.soft,
                color: bucket.bg,
                fontSize: 12,
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              <span>{rank ?? "—"}</span>
              <span style={{ opacity: 0.85, fontWeight: 600 }}>{bucket.label}</span>
            </span>
          )}
        </td>
        <td
          style={{
            ...cellStyle,
            color: errored ? "#9f1239" : "#475569",
            maxWidth: 0,
          }}
        >
          <div
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              fontSize: 14,
              lineHeight: 1.5,
            }}
            title={summary || ""}
          >
            {summary || (errored ? "Couldn’t analyze this site." : "—")}
          </div>
        </td>
        <td style={{ ...cellStyle, textAlign: "center", color: "#64748b", paddingTop: 18 }}>
          <span
            aria-hidden
            style={{
              display: "inline-block",
              transition: "transform 0.18s ease",
              transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            ›
          </span>
        </td>
      </tr>
      {isOpen ? (
        <tr>
          <td
            colSpan={5}
            style={{
              padding: 0,
              background: "#f8fafc",
              borderTop: "1px solid #f1f5f9",
            }}
          >
            <div style={{ padding: 18 }}>
              <PartnerCard partner={partner} index={index} />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 15 }}>{value}</div>
    </div>
  );
}

function PartnerCard({ partner, index }: { partner: Partner; index: number }) {
  if (!partner.ok) {
    return (
      <article
        style={{
          background: "white",
          border: "1px solid #fecdd3",
          borderRadius: 16,
          padding: 18,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: "#0f172a" }}>{partner.name}</h3>
          <span style={{ fontSize: 12, color: "#9f1239", fontWeight: 600 }}>Couldn’t analyze</span>
        </div>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: "#9f1239" }}>{partner.error}</p>
      </article>
    );
  }

  const a = partner.result.analysis;
  const p = a.payload;
  const rank = a.rank_1_to_10 ?? p.rank1to10 ?? null;
  const bucket = fitBucket(rank);

  return (
    <article
      style={{
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 12px 30px -24px rgba(15, 23, 42, 0.4)",
      }}
    >
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          alignItems: "center",
          padding: "18px 20px",
          borderBottom: "1px solid #f1f5f9",
        }}
      >
        <RankBadge rank={rank} bucket={bucket} />
        <div style={{ flex: "1 1 auto", minWidth: 180 }}>
          <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>Match #{index + 1}</div>
          <h3 style={{ margin: "2px 0 0", fontSize: 20, color: "#0f172a", letterSpacing: -0.01 }}>
            {partner.name}
          </h3>
        </div>
        <span
          style={{
            padding: "6px 12px",
            borderRadius: 999,
            background: bucket.soft,
            color: bucket.bg,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {bucket.label}
        </span>
      </header>

      <div style={{ padding: 20, display: "grid", gap: 18 }}>
        {p.targetProfile?.summary ? (
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "#334155" }}>
            {p.targetProfile.summary}
          </p>
        ) : null}

        {p.matchReasons && p.matchReasons.length > 0 ? (
          <Bullets
            title="Why this is a great match"
            tone="good"
            items={p.matchReasons}
          />
        ) : null}

        {p.personalizationAnchors && p.personalizationAnchors.length > 0 ? (
          <Anchors items={p.personalizationAnchors} />
        ) : null}

        {p.emailDraft ? <EmailDraft email={p.emailDraft} partnerName={partner.name} /> : null}

        {p.risks && p.risks.length > 0 ? (
          <Bullets title="Worth noting" tone="warn" items={p.risks} />
        ) : null}
      </div>
    </article>
  );
}

function RankBadge({
  rank,
  bucket,
}: {
  rank: number | null;
  bucket: ReturnType<typeof fitBucket>;
}) {
  return (
    <div
      style={{
        width: 64,
        height: 64,
        borderRadius: 18,
        background: `linear-gradient(135deg, ${bucket.bg} 0%, ${bucket.bg}cc 100%)`,
        color: bucket.fg,
        display: "grid",
        placeItems: "center",
        boxShadow: `0 12px 22px -12px ${bucket.bg}`,
        flexShrink: 0,
      }}
      aria-label={`Fit score ${rank ?? "unknown"} out of 10`}
    >
      <div style={{ display: "grid", placeItems: "center", lineHeight: 1 }}>
        <span style={{ fontSize: 24, fontWeight: 800 }}>{rank ?? "—"}</span>
        <span style={{ fontSize: 10, opacity: 0.85, marginTop: 2, fontWeight: 600, letterSpacing: 0.4 }}>
          / 10
        </span>
      </div>
    </div>
  );
}

function Bullets({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "good" | "warn";
}) {
  const color = tone === "good" ? "#059669" : "#b45309";
  const bg = tone === "good" ? "#ecfdf5" : "#fffbeb";
  const border = tone === "good" ? "#a7f3d0" : "#fde68a";
  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 12,
        padding: "12px 14px",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 6 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 18, color: "#334155", fontSize: 14, lineHeight: 1.55 }}>
        {items.map((m, i) => (
          <li key={i} style={{ marginBottom: i === items.length - 1 ? 0 : 4 }}>
            {m}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Anchors({ items }: { items: { fact: string; sourceUrl: string }[] }) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
        What we noticed on their site
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, color: "#334155", fontSize: 14, lineHeight: 1.55 }}>
        {items.map((a, i) => (
          <li key={i} style={{ marginBottom: i === items.length - 1 ? 0 : 4 }}>
            {a.fact}{" "}
            {a.sourceUrl ? (
              <a
                href={a.sourceUrl}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#7c3aed", textDecoration: "none", fontSize: 13 }}
              >
                source ↗
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmailDraft({
  email,
  partnerName,
}: {
  email: { subjectOptions: string[]; body: string };
  partnerName: string;
}) {
  const [copied, setCopied] = useState<"none" | "subject" | "body" | "all">("none");

  const subject = email.subjectOptions[0] ?? "";

  const copy = useCallback(async (text: string, kind: "subject" | "body" | "all") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied("none"), 1600);
    } catch {
      setCopied("none");
    }
  }, []);

  return (
    <div
      style={{
        background: "#0f172a",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 14px 30px -22px rgba(15, 23, 42, 0.7)",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          background: "#1e293b",
          color: "#cbd5f5",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>Ready-to-send intro</span>
        <button
          type="button"
          onClick={() => void copy(`Subject: ${subject}\n\n${email.body}`, "all")}
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "white",
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {copied === "all" ? "Copied!" : "Copy email"}
        </button>
      </div>

      <div style={{ padding: "16px 18px", color: "#e2e8f0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>Subject</div>
          <button
            type="button"
            onClick={() => void copy(subject, "subject")}
            aria-label="Copy subject"
            style={{
              background: "transparent",
              color: copied === "subject" ? "#a7f3d0" : "#94a3b8",
              border: "none",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {copied === "subject" ? "Copied" : "Copy"}
          </button>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "white", marginBottom: 14 }}>{subject || "—"}</div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>Body to {partnerName}</div>
          <button
            type="button"
            onClick={() => void copy(email.body, "body")}
            aria-label="Copy body"
            style={{
              background: "transparent",
              color: copied === "body" ? "#a7f3d0" : "#94a3b8",
              border: "none",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {copied === "body" ? "Copied" : "Copy"}
          </button>
        </div>
        <pre
          style={{
            margin: 0,
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
            whiteSpace: "pre-wrap",
            lineHeight: 1.6,
            fontSize: 15,
            color: "#f8fafc",
          }}
        >
          {email.body}
        </pre>
      </div>
    </div>
  );
}

function BusinessTile({
  sample,
  selected,
  disabled,
  onSelect,
}: {
  sample: SampleBusiness;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      style={{
        textAlign: "left",
        padding: "14px 14px",
        background: selected ? "#faf5ff" : "white",
        border: selected ? "2px solid #7c3aed" : "1px solid #e2e8f0",
        borderRadius: 14,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled && !selected ? 0.65 : 1,
        boxShadow: selected
          ? "0 10px 24px -16px rgba(124, 58, 237, 0.45)"
          : "0 4px 14px -10px rgba(15, 23, 42, 0.18)",
        transition: "transform 0.12s, box-shadow 0.12s, border-color 0.12s",
        minWidth: 0,
        position: "relative",
        display: "flex",
        gap: 12,
        alignItems: "center",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={faviconUrl(sample.website_url, 128)}
        alt=""
        width={36}
        height={36}
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: "white",
          border: "1px solid #e2e8f0",
          objectFit: "contain",
          flexShrink: 0,
          padding: 4,
          boxSizing: "border-box",
        }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "#0f172a",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {sample.name}
        </div>
        {sample.blurb ? (
          <div
            style={{
              fontSize: 12,
              color: "#64748b",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              marginTop: 2,
            }}
          >
            {sample.blurb}
          </div>
        ) : null}
      </div>
      {selected ? (
        <div
          aria-hidden
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            background: "#7c3aed",
            color: "white",
            display: "grid",
            placeItems: "center",
            fontSize: 12,
            flexShrink: 0,
          }}
        >
          ✓
        </div>
      ) : null}
    </button>
  );
}

function ModeTabs({
  mode,
  onChange,
  disabled,
}: {
  mode: SourceMode;
  onChange: (m: SourceMode) => void;
  disabled: boolean;
}) {
  const tabs: { key: SourceMode; label: string }[] = [
    { key: "sample", label: "Sample" },
    { key: "custom", label: "Use my own" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Choose source"
      style={{
        display: "inline-flex",
        padding: 4,
        borderRadius: 12,
        background: "#f1f5f9",
        gap: 4,
      }}
    >
      {tabs.map((t) => {
        const active = mode === t.key;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            disabled={disabled}
            style={{
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 700,
              borderRadius: 9,
              border: "none",
              background: active ? "white" : "transparent",
              color: active ? "#0f172a" : "#64748b",
              boxShadow: active ? "0 4px 10px -6px rgba(15, 23, 42, 0.25)" : "none",
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function CustomBusinessForm({
  url,
  description,
  onUrlChange,
  onDescriptionChange,
  disabled,
  normalized,
}: {
  url: string;
  description: string;
  onUrlChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  disabled: boolean;
  normalized: string | null;
}) {
  const showWarning = url.trim().length > 0 && normalized == null;
  return (
    <div
      style={{
        marginBottom: 20,
        padding: 18,
        border: "1px dashed #c4b5fd",
        borderRadius: 14,
        background: "#faf5ff",
        display: "grid",
        gap: 14,
      }}
    >
      <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
        <label htmlFor="pfCustomUrl" style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>
          Your business website
        </label>
        <input
          id="pfCustomUrl"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://yourbusiness.com"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          disabled={disabled}
          style={{
            width: "100%",
            padding: "12px 14px",
            fontSize: 16,
            borderRadius: 12,
            border: showWarning ? "1px solid #fecaca" : "1px solid #e2e8f0",
            background: disabled ? "#f8fafc" : "white",
            boxSizing: "border-box",
            minWidth: 0,
          }}
        />
        {showWarning ? (
          <span style={{ fontSize: 12, color: "#b91c1c" }}>
            That doesn’t look like a valid URL. Try something like <code>https://example.com</code>.
          </span>
        ) : normalized ? (
          <span style={{ fontSize: 12, color: "#16a34a" }}>
            ✓ Will scout partners near {friendlyDomain(normalized)}
          </span>
        ) : (
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            We’ll read your homepage + a few key pages to learn what you do.
          </span>
        )}
      </div>

      <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
        <label htmlFor="pfCustomDesc" style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>
          One-line description{" "}
          <span style={{ fontWeight: 400, color: "#94a3b8" }}>(optional, up to ~800 chars)</span>
        </label>
        <textarea
          id="pfCustomDesc"
          rows={3}
          maxLength={800}
          placeholder="e.g. We’re a Portland-based industrial design studio focused on ergonomic medical devices. Looking for fabrication, prototyping, and packaging partners."
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          disabled={disabled}
          style={{
            width: "100%",
            padding: "12px 14px",
            fontSize: 15,
            borderRadius: 12,
            border: "1px solid #e2e8f0",
            background: disabled ? "#f8fafc" : "white",
            boxSizing: "border-box",
            minWidth: 0,
            resize: "vertical",
            fontFamily: "inherit",
            lineHeight: 1.5,
          }}
        />
        <span style={{ fontSize: 12, color: "#94a3b8" }}>
          Helps us tailor outreach when the site alone is ambiguous.
        </span>
      </div>
    </div>
  );
}

const TECH_LOGOS: { name: string; slug: string; color: string; href: string }[] = [
  { name: "Next.js", slug: "nextdotjs", color: "0f172a", href: "https://nextjs.org" },
  { name: "Supabase", slug: "supabase", color: "3ECF8E", href: "https://supabase.com" },
  { name: "Vercel", slug: "vercel", color: "0f172a", href: "https://vercel.com" },
  { name: "OpenAI", slug: "openai", color: "0f172a", href: "https://openai.com" },
  { name: "Firecrawl", slug: "firecrawl", color: "F97316", href: "https://firecrawl.dev" },
  { name: "Google Maps", slug: "googlemaps", color: "4285F4", href: "https://developers.google.com/maps" },
  { name: "PostgreSQL", slug: "postgresql", color: "4169E1", href: "https://www.postgresql.org" },
  { name: "TypeScript", slug: "typescript", color: "3178C6", href: "https://www.typescriptlang.org" },
];

function TechWall() {
  return (
    <section
      aria-label="Built with"
      style={{
        marginTop: 28,
        padding: "28px 24px",
        borderRadius: 18,
        background: "white",
        border: "1px solid #e2e8f0",
        boxShadow: "0 10px 24px -22px rgba(15, 23, 42, 0.4)",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <div
          style={{
            fontSize: 11,
            color: "#94a3b8",
            fontWeight: 700,
            letterSpacing: 1.4,
            textTransform: "uppercase",
          }}
        >
          Built with
        </div>
        <div style={{ fontSize: 16, color: "#0f172a", fontWeight: 700, marginTop: 4 }}>
          PDX Connect runs on a modern stack
        </div>
      </div>

      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 14,
          alignItems: "center",
          justifyItems: "center",
        }}
      >
        {TECH_LOGOS.map((t) => (
          <li key={t.slug} style={{ display: "grid", placeItems: "center", gap: 6 }}>
            <a
              href={t.href}
              target="_blank"
              rel="noreferrer"
              title={t.name}
              style={{
                display: "grid",
                placeItems: "center",
                width: 56,
                height: 56,
                borderRadius: 14,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                transition: "transform 0.15s, box-shadow 0.15s",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://cdn.simpleicons.org/${t.slug}/${t.color}`}
                alt={`${t.name} logo`}
                width={28}
                height={28}
                loading="lazy"
                style={{ width: 28, height: 28, objectFit: "contain" }}
              />
            </a>
            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>{t.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
