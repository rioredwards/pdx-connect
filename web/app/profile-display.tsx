"use client";

import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import type { ExtractedProfile } from "./extracted-profile";

export type { ExtractedProfile } from "./extracted-profile";

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm leading-relaxed text-foreground">{children}</div>
    </div>
  );
}

function BadgeList({ items, empty }: { items: unknown; empty: string }) {
  if (!Array.isArray(items) || items.length === 0) {
    return <span className="text-sm text-muted-foreground">{empty}</span>;
  }
  const strings = items.filter((x) => typeof x === "string") as string[];
  return (
    <div className="flex flex-wrap gap-1.5">
      {strings.map((s, i) => (
        <Badge key={`${i}-${s.slice(0, 40)}`} variant="secondary">
          {s}
        </Badge>
      ))}
    </div>
  );
}

function StringList({ items, empty }: { items: unknown; empty: string }) {
  if (!Array.isArray(items) || items.length === 0) {
    return <span className="text-sm text-muted-foreground">{empty}</span>;
  }
  const strings = items.filter((x) => typeof x === "string") as string[];
  return (
    <ul className="grid gap-1 pl-4 [&>li]:list-disc">
      {strings.map((s, i) => (
        <li key={`${i}-${s.slice(0, 40)}`}>{s}</li>
      ))}
    </ul>
  );
}

export function ProfileDisplay(props: {
  profile: ExtractedProfile | null;
  pagesScraped?: number;
  projectId?: string;
  scrapeRunId?: string;
}) {
  const { profile, pagesScraped, projectId, scrapeRunId } = props;
  if (!profile || typeof profile !== "object") {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        No structured profile in this response.
      </p>
    );
  }

  const loc = profile.location ?? {};
  const contact = profile.contact ?? {};
  const locationLine =
    [loc.address, loc.city, loc.region, loc.country].filter(Boolean).join(", ") || "—";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          {safeString(profile.name) || "Business profile"}
        </CardTitle>
        {profile.websiteUrl ? (
          <a
            href={profile.websiteUrl}
            target="_blank"
            rel="noreferrer"
            className="break-all text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {profile.websiteUrl}
          </a>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {pagesScraped != null ? <span>{pagesScraped} pages scraped</span> : null}
          {projectId ? <span>Project · {projectId.slice(0, 8)}…</span> : null}
          {scrapeRunId ? <span>Run · {scrapeRunId.slice(0, 8)}…</span> : null}
        </div>
      </CardHeader>

      <CardContent className="grid gap-5">
        {safeString(profile.description) ? (
          <p className="text-sm leading-relaxed text-foreground">{profile.description}</p>
        ) : null}

        <Separator />

        <Field label="Categories">
          <BadgeList items={profile.categories} empty="None listed" />
        </Field>

        <Field label="Location & service area">
          <div className="grid gap-1">
            <span>{locationLine}</span>
            {profile.serviceArea ? (
              <span className="text-muted-foreground">Service area: {profile.serviceArea}</span>
            ) : null}
          </div>
        </Field>

        <Field label="Contact">
          <div className="grid gap-1">
            {contact.contactPageUrl ? (
              <a
                href={contact.contactPageUrl}
                target="_blank"
                rel="noreferrer"
                className="break-all underline-offset-2 hover:underline"
              >
                {contact.contactPageUrl}
              </a>
            ) : null}
            {contact.emails?.length ? <span>Email · {contact.emails.join(", ")}</span> : null}
            {contact.phones?.length ? <span>Phone · {contact.phones.join(", ")}</span> : null}
            {!contact.contactPageUrl && !contact.emails?.length && !contact.phones?.length ? (
              <span className="text-muted-foreground">No direct contact details extracted.</span>
            ) : null}
          </div>
        </Field>

        {safeString(profile.hours) ? (
          <Field label="Hours">
            <span>{profile.hours}</span>
          </Field>
        ) : null}

        <Field label="Value props">
          <StringList items={profile.valueProps} empty="None listed" />
        </Field>

        <Field label="Products & services">
          <StringList items={profile.productsServices} empty="None listed" />
        </Field>

        <Field label="Social & links">
          <BadgeList items={profile.socialLinks} empty="None listed" />
        </Field>

        {Array.isArray(profile.citations) && profile.citations.length > 0 ? (
          <details className="group">
            <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
              Citations ({profile.citations.length})
            </summary>
            <div className="mt-3 grid gap-2">
              {profile.citations.map((c, i) => (
                <div key={i} className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {safeString(c.field) || "field"}
                  </div>
                  {c.sourceUrl ? (
                    <a
                      href={c.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 block break-all text-xs text-muted-foreground hover:text-foreground"
                    >
                      {c.sourceUrl}
                    </a>
                  ) : null}
                  {c.snippet ? (
                    <p className="mt-2 border-l-2 border-border pl-3 text-sm text-muted-foreground">
                      {c.snippet}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}
