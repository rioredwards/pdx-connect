"use client";

import { Loader2, Search, Download } from "lucide-react";
import { useReducer, useState, useTransition, type ReactNode } from "react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mapPool } from "@/lib/batch-pool";
import { downloadCsv, toCsv } from "@/lib/csv";
import type { SampleBusiness } from "@/lib/sample-businesses";
import { cn } from "@/lib/utils";

import {
  analyzeTargetAction,
  discoverTargetsAction,
  listProjectTargetsAction,
  scrapeWebsiteAction,
  type AnalysisResult,
  type DiscoverState,
  type TargetRow,
} from "./actions";
import type { ExtractedProfile } from "./extracted-profile";
import { ProfileDisplay } from "./profile-display";

type AnalysisPayload = AnalysisResult["analysis"]["payload"];

type RowStatus = "pending" | "running" | "ok" | "error";

type AnalysisRow = {
  id: string;
  name: string;
  websiteUrl: string | null;
  address: string | null;
  distanceMeters: number | null;
  status: RowStatus;
  rank: number | null;
  payload?: AnalysisPayload;
  error?: string;
};

type DiscoverySummary = (DiscoverState & { ok: true })["summary"];

type Phase = "idle" | "scraping" | "discovering" | "analyzing" | "done" | "error";

type State = {
  phase: Phase;
  url: string;
  title: string;
  error?: string;
  profile?: ExtractedProfile;
  projectId?: string;
  pagesScraped?: number;
  scrapeRunId?: string;
  discovery?: DiscoverySummary;
  rows: AnalysisRow[];
};

type Action =
  | { type: "START"; url: string; title: string }
  | { type: "SCRAPE_OK"; profile: ExtractedProfile | null; projectId: string; pages?: number; scrapeRunId?: string }
  | { type: "DISCOVER_OK"; summary: DiscoverySummary; rows: AnalysisRow[] }
  | { type: "ROW_RUNNING"; id: string }
  | { type: "ROW_OK"; id: string; rank: number | null; payload: AnalysisPayload }
  | { type: "ROW_ERR"; id: string; error: string }
  | { type: "FINISH" }
  | { type: "FAIL"; message: string }
  | { type: "RESET" };

const initialState: State = {
  phase: "idle",
  url: "",
  title: "",
  rows: [],
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "START":
      return { ...initialState, phase: "scraping", url: action.url, title: action.title };
    case "SCRAPE_OK":
      return {
        ...state,
        phase: "discovering",
        profile: action.profile ?? undefined,
        projectId: action.projectId,
        pagesScraped: action.pages,
        scrapeRunId: action.scrapeRunId,
      };
    case "DISCOVER_OK":
      return { ...state, phase: "analyzing", discovery: action.summary, rows: action.rows };
    case "ROW_RUNNING":
      return {
        ...state,
        rows: state.rows.map((r) => (r.id === action.id ? { ...r, status: "running" } : r)),
      };
    case "ROW_OK":
      return {
        ...state,
        rows: state.rows.map((r) =>
          r.id === action.id
            ? { ...r, status: "ok", rank: action.rank, payload: action.payload }
            : r,
        ),
      };
    case "ROW_ERR":
      return {
        ...state,
        rows: state.rows.map((r) =>
          r.id === action.id ? { ...r, status: "error", error: action.error } : r,
        ),
      };
    case "FINISH": {
      const sorted = [...state.rows].sort((a, b) => {
        const ra = a.rank ?? -1;
        const rb = b.rank ?? -1;
        if (rb !== ra) return rb - ra;
        return a.name.localeCompare(b.name);
      });
      return { ...state, phase: "done", rows: sorted };
    }
    case "FAIL":
      return { ...state, phase: "error", error: action.message };
    case "RESET":
      return initialState;
  }
}

const CONCURRENCY = 8;

function fdFromObject(obj: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(obj)) fd.set(k, v);
  return fd;
}

function rowFromTarget(t: TargetRow): AnalysisRow {
  return {
    id: t.id,
    name: t.name,
    websiteUrl: t.website_url ?? null,
    address: t.address ?? null,
    distanceMeters: t.distance_meters ?? null,
    status: "pending",
    rank: null,
  };
}

function miles(m: number | null | undefined): string {
  if (m == null) return "—";
  return `${(m / 1609.34).toFixed(1)} mi`;
}

function StatusPill({ row }: { row: AnalysisRow }) {
  if (row.status === "running") {
    return (
      <Badge variant="outline" className="gap-1">
        <Loader2 className="size-3 animate-spin" /> running
      </Badge>
    );
  }
  if (row.status === "error") {
    return <Badge variant="destructive">error</Badge>;
  }
  if (row.status === "ok") {
    return <Badge variant="default">{row.rank ?? "—"}/10</Badge>;
  }
  return <Badge variant="secondary">queued</Badge>;
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "inline-flex size-5 items-center justify-center rounded-full border text-[10px] font-semibold",
          done && "border-primary bg-primary text-primary-foreground",
          active && !done && "border-foreground bg-foreground/10 text-foreground",
          !active && !done && "border-border bg-muted text-muted-foreground",
        )}
      >
        {done ? "✓" : active ? <Loader2 className="size-3 animate-spin" /> : ""}
      </span>
      <span className={cn("text-xs", active || done ? "text-foreground" : "text-muted-foreground")}>{label}</span>
    </div>
  );
}

export function Wizard({ samples }: { samples: SampleBusiness[] }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState(samples[0]?.website_url ?? "");
  const [title, setTitle] = useState(samples[0]?.name ?? "");

  function pickSample(s: SampleBusiness) {
    setUrl(s.website_url);
    setTitle(s.name);
  }

  async function run(formUrl: string, formTitle: string) {
    dispatch({ type: "START", url: formUrl, title: formTitle });

    const scrape = await scrapeWebsiteAction(null, fdFromObject({ url: formUrl }));
    if (!scrape.ok) {
      dispatch({ type: "FAIL", message: `Scrape failed: ${scrape.error}` });
      return;
    }
    const projectId = scrape.view.projectId ?? "";
    if (!projectId) {
      dispatch({ type: "FAIL", message: "Scrape returned no project id." });
      return;
    }
    dispatch({
      type: "SCRAPE_OK",
      profile: scrape.view.extractedProfile,
      projectId,
      pages: scrape.view.pagesScraped,
      scrapeRunId: scrape.view.scrapeRunId,
    });

    const discover = await discoverTargetsAction(
      null,
      fdFromObject({ projectId, title: formTitle, sourceUrl: formUrl }),
    );
    if (!discover.ok) {
      dispatch({ type: "FAIL", message: `Discover failed: ${discover.error}` });
      return;
    }

    const list = await listProjectTargetsAction(projectId, true, 50);
    if (!list.ok) {
      dispatch({ type: "FAIL", message: `List targets failed: ${list.error}` });
      return;
    }
    if (list.targets.length === 0) {
      dispatch({ type: "FAIL", message: "No targets returned. Try a different sample or area." });
      return;
    }

    const rows: AnalysisRow[] = discover.summary.targets.length
      ? discover.summary.targets.map(rowFromTarget)
      : list.targets.map((t) => ({
          id: t.id,
          name: t.name,
          websiteUrl: null,
          address: null,
          distanceMeters: t.distance_meters ?? null,
          status: "pending" as const,
          rank: null,
        }));

    dispatch({ type: "DISCOVER_OK", summary: discover.summary, rows });

    await mapPool(list.targets, CONCURRENCY, async (t) => {
      dispatch({ type: "ROW_RUNNING", id: t.id });
      const r = await analyzeTargetAction(null, fdFromObject({ targetBusinessId: t.id, skipScrape: "" }));
      if (r.ok) {
        const rank = r.result.analysis.rank_1_to_10 ?? r.result.analysis.payload.rank1to10 ?? null;
        dispatch({ type: "ROW_OK", id: t.id, rank, payload: r.result.analysis.payload });
      } else {
        dispatch({ type: "ROW_ERR", id: t.id, error: r.error });
      }
    });

    dispatch({ type: "FINISH" });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || state.phase === "scraping" || state.phase === "discovering" || state.phase === "analyzing") return;
    const cleanUrl = url.trim();
    const cleanTitle = title.trim() || cleanUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!cleanUrl) return;
    startTransition(() => {
      void run(cleanUrl, cleanTitle);
    });
  }

  function exportCsv() {
    const rows = state.rows
      .filter((r) => r.status === "ok")
      .map((r) => ({
        Name: r.name,
        Website: r.websiteUrl ?? "",
        Address: r.address ?? "",
        DistanceMiles: r.distanceMeters != null ? (r.distanceMeters / 1609.34).toFixed(2) : "",
        Rank: r.rank ?? "",
        Subject: r.payload?.emailDraft?.subjectOptions?.[0] ?? "",
        Body: r.payload?.emailDraft?.body ?? "",
      }));
    if (rows.length === 0) return;
    const csv = toCsv(rows, [
      "Name",
      "Website",
      "Address",
      "DistanceMiles",
      "Rank",
      "Subject",
      "Body",
    ]);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    downloadCsv(`pdx-connect-${stamp}.csv`, csv);
  }

  const running =
    state.phase === "scraping" || state.phase === "discovering" || state.phase === "analyzing";

  const completedCount = state.rows.filter((r) => r.status === "ok" || r.status === "error").length;
  const totalCount = state.rows.length;
  const progress = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  return (
    <div className="grid gap-8">
      <StartCard
        url={url}
        title={title}
        setUrl={setUrl}
        setTitle={setTitle}
        samples={samples}
        pickSample={pickSample}
        onSubmit={onSubmit}
        running={running}
        phase={state.phase}
      />

      {state.phase !== "idle" ? <PipelineStrip phase={state.phase} /> : null}

      {state.phase === "error" && state.error ? (
        <Alert variant="destructive">
          <AlertTitle>Run failed</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      {state.phase === "scraping" ? (
        <Card>
          <CardContent className="grid gap-3 py-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
      ) : null}

      {state.profile || state.phase === "discovering" || state.phase === "analyzing" || state.phase === "done" ? (
        <ProfileDisplay
          profile={state.profile ?? null}
          pagesScraped={state.pagesScraped}
          projectId={state.projectId}
          scrapeRunId={state.scrapeRunId}
        />
      ) : null}

      {state.profile && (state.phase === "discovering" || state.phase === "analyzing" || state.phase === "done") ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Default partnership package</CardTitle>
            <CardDescription>
              Stub used by the demo. Edits live in <code>offers</code> for production runs.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-muted-foreground">
            <p>
              We pitch a low-friction co-marketing partnership: warm intros, light cross-promotion, and a clear next
              step. Each draft uses 1–2 facts pulled from the target&apos;s site so the email reads written, not
              templated.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {state.phase === "discovering" ? (
        <Card>
          <CardContent className="grid gap-2 py-4">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
      ) : null}

      {(state.phase === "analyzing" || state.phase === "done") && state.rows.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Targets</CardTitle>
                <CardDescription>
                  {state.discovery ? (
                    <>
                      {state.rows.length} businesses · queries:{" "}
                      <span className="text-foreground">{state.discovery.queries.join(" · ")}</span>
                    </>
                  ) : (
                    "Loading…"
                  )}
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={exportCsv}
                disabled={state.phase !== "done" || state.rows.every((r) => r.status !== "ok")}
              >
                <Download /> Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            {state.phase === "analyzing" ? (
              <Progress value={progress}>
                <ProgressLabel>Analyzing</ProgressLabel>
                <span className="ml-auto text-sm tabular-nums text-muted-foreground">
                  {completedCount} / {totalCount}
                </span>
              </Progress>
            ) : null}

            <Separator />

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Distance</TableHead>
                  <TableHead className="hidden md:table-cell">Website</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <StatusPill row={row} />
                    </TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {miles(row.distanceMeters)}
                    </TableCell>
                    <TableCell className="hidden max-w-[260px] truncate text-muted-foreground md:table-cell">
                      {row.websiteUrl ? (
                        <a
                          href={row.websiteUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-foreground hover:underline"
                        >
                          {row.websiteUrl.replace(/^https?:\/\//, "")}
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {state.rows.some((r) => r.status === "ok") ? (
              <>
                <Separator />
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-foreground">Outreach drafts</h3>
                  <Accordion>
                    {state.rows
                      .filter((r) => r.status === "ok")
                      .map((row) => (
                        <RowDetails key={row.id} row={row} />
                      ))}
                  </Accordion>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function RowDetails({ row }: { row: AnalysisRow }) {
  const p = row.payload;
  return (
    <AccordionItem value={row.id}>
      <AccordionTrigger>
        <div className="flex flex-1 items-center gap-3 pr-3">
          <Badge variant="default" className="shrink-0">
            {row.rank ?? "—"}/10
          </Badge>
          <span className="truncate">{row.name}</span>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="grid gap-4 pb-2">
          {p?.targetProfile?.summary ? (
            <DetailBlock label="Target read">
              <p className="text-sm leading-relaxed text-foreground">{p.targetProfile.summary}</p>
            </DetailBlock>
          ) : null}

          {p?.matchReasons && p.matchReasons.length > 0 ? (
            <DetailBlock label="Why it fits">
              <ul className="grid gap-1 pl-4 [&>li]:list-disc">
                {p.matchReasons.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </DetailBlock>
          ) : null}

          {p?.risks && p.risks.length > 0 ? (
            <DetailBlock label="Risks / gaps">
              <ul className="grid gap-1 pl-4 text-amber-700 dark:text-amber-400 [&>li]:list-disc">
                {p.risks.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </DetailBlock>
          ) : null}

          {p?.personalizationAnchors && p.personalizationAnchors.length > 0 ? (
            <DetailBlock label="Anchors">
              <ul className="grid gap-1 pl-4 [&>li]:list-disc">
                {p.personalizationAnchors.map((a, i) => (
                  <li key={i}>
                    {a.fact}{" "}
                    <a
                      href={a.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      (source)
                    </a>
                  </li>
                ))}
              </ul>
            </DetailBlock>
          ) : null}

          {p?.emailDraft ? (
            <DetailBlock label="Draft email">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Subject options
                </div>
                <ul className="mt-1 grid gap-1 pl-4 text-sm [&>li]:list-disc">
                  {p.emailDraft.subjectOptions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
                <div className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Body
                </div>
                <pre className="mt-1 whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
                  {p.emailDraft.body}
                </pre>
              </div>
            </DetailBlock>
          ) : null}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function DetailBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm leading-relaxed text-foreground">{children}</div>
    </div>
  );
}

function StartCard(props: {
  url: string;
  title: string;
  setUrl: (v: string) => void;
  setTitle: (v: string) => void;
  samples: SampleBusiness[];
  pickSample: (s: SampleBusiness) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  running: boolean;
  phase: Phase;
}) {
  const { url, title, setUrl, setTitle, samples, pickSample, onSubmit, running, phase } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Find local partners</CardTitle>
        <CardDescription>
          Paste a Portland small-business URL or pick a sample. We scrape the site, find nearby complementary
          businesses, and draft a personalized outreach for each.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-2">
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Samples</Label>
          <div className="flex flex-wrap gap-1.5">
            {samples.map((s) => {
              const active = s.website_url === url;
              return (
                <Button
                  key={s.id}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  onClick={() => pickSample(s)}
                  disabled={running}
                >
                  {s.name}
                </Button>
              );
            })}
          </div>
        </div>

        <form onSubmit={onSubmit} className="grid gap-3">
          <div className="grid gap-2 md:grid-cols-[1fr_220px] md:items-end md:gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="url">Website URL</Label>
              <Input
                id="url"
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                disabled={running}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="title">Display name</Label>
              <Input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Optional"
                disabled={running}
              />
            </div>
          </div>
          <div>
            <Button type="submit" disabled={running || !url.trim()}>
              {running ? <Loader2 className="animate-spin" /> : <Search />}
              {phase === "idle" || phase === "error" ? "Find partners" : "Running…"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PipelineStrip({ phase }: { phase: Phase }) {
  const steps: { id: Phase; label: string }[] = [
    { id: "scraping", label: "Scrape source site" },
    { id: "discovering", label: "Discover targets" },
    { id: "analyzing", label: "Rank + draft" },
  ];
  const order = (p: Phase) => (p === "idle" ? 0 : p === "scraping" ? 1 : p === "discovering" ? 2 : p === "analyzing" ? 3 : 4);
  const cur = order(phase);
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card px-4 py-2.5">
      {steps.map((s, i) => {
        const idx = i + 1;
        return (
          <StepDot
            key={s.id}
            label={s.label}
            active={cur === idx}
            done={cur > idx}
          />
        );
      })}
    </div>
  );
}
