"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { scrapeWebsiteAction, type ScrapeState } from "./actions";
import { ProfileDisplay } from "./profile-display";

const initialState: ScrapeState | null = null;

export function ScrapeForm() {
  const [state, formAction] = useActionState(scrapeWebsiteAction, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test scrape</CardTitle>
        <CardDescription>
          Calls the Supabase Edge Function <code>scrape_analyze</code> using
          server-only secrets.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="url">Website URL</Label>
            <Input
              id="url"
              name="url"
              type="url"
              required
              placeholder="https://example.com"
              defaultValue="https://regrainery.com/"
            />
          </div>

          <Button type="submit" className="w-fit">
            Run test scrape
          </Button>

          {state && !state.ok ? (
            <pre
              className={cn(
                "m-0 max-h-[min(60vh,32rem)] overflow-auto rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[13px] text-destructive wrap-break-word whitespace-pre-wrap"
              )}
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
              <details className="mt-1 rounded-lg border border-border bg-card p-3">
                <summary className="cursor-pointer text-[13px] font-semibold text-muted-foreground">
                  Raw JSON response
                </summary>
                <pre
                  className={cn(
                    "m-0 mt-3 max-h-[min(60vh,32rem)] overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs leading-snug wrap-break-word whitespace-pre-wrap"
                  )}
                >
                  {state.pretty}
                </pre>
              </details>
            </>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
