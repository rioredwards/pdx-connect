"use client";

import { useCallback, useState } from "react";

import { AnalyzeForm } from "./analyze-form";
import { DiscoverForm } from "./discover-form";
import { ScrapeForm } from "./scrape-form";
import type { WorkflowProject } from "./workflow-types";
export type { WorkflowProject } from "./workflow-types";

/**
 * Lifts the project from step 1 (scrape) so steps 2–3 use the same business / project_id.
 */
export function AnalysisTesterWorkflow() {
  const [workflow, setWorkflow] = useState<WorkflowProject | null>(null);

  const onScrapeProjectReady = useCallback((p: WorkflowProject) => {
    setWorkflow(p);
  }, []);

  return (
    <>
      <ScrapeForm onWorkflowProjectReady={onScrapeProjectReady} />
      <DiscoverForm activeProjectId={workflow?.projectId ?? null} sourceUrl={workflow?.sourceUrl ?? null} />
      <AnalyzeForm activeProjectId={workflow?.projectId ?? null} sourceUrl={workflow?.sourceUrl ?? null} />
    </>
  );
}
