"use client";

import type { CSSProperties } from "react";

import type { ExtractedProfile } from "./extracted-profile";

export type { ExtractedProfile } from "./extracted-profile";

const section: CSSProperties = {
  marginTop: 20,
  paddingTop: 20,
  borderTop: "1px solid #e5e7eb",
};

const h2: CSSProperties = {
  margin: "0 0 10px",
  fontSize: 15,
  fontWeight: 700,
  color: "#0f172a",
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
};

const p: CSSProperties = {
  margin: "0 0 8px",
  lineHeight: 1.6,
  color: "#1e293b",
  fontSize: 15,
};

const meta: CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  marginBottom: 16,
};

const list: CSSProperties = {
  margin: "6px 0 0",
  paddingLeft: 20,
  lineHeight: 1.6,
  color: "#1e293b",
  fontSize: 14,
};

const card: CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: 14,
  background: "#fff",
  marginTop: 16,
};

const citeBox: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.5,
  color: "#334155",
  marginTop: 6,
  padding: "8px 10px",
  background: "#f1f5f9",
  borderRadius: 6,
  borderLeft: "3px solid #94a3b8",
};

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function StringList({ items, empty }: { items: unknown; empty: string }) {
  if (!Array.isArray(items) || items.length === 0) {
    return <p style={{ ...p, color: "#94a3b8", fontSize: 14 }}>{empty}</p>;
  }
  const strings = items.filter((x) => typeof x === "string") as string[];
  return (
    <ul style={list}>
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
      <p style={p} role="status">
        No structured profile in this response.
      </p>
    );
  }

  const loc = profile.location || {};
  const contact = profile.contact || {};

  return (
    <article
      style={{
        marginTop: 20,
        padding: 20,
        borderRadius: 12,
        border: "1px solid #e2e8f0",
        background: "#f8fafc",
      }}
    >
      <header>
        <h1 style={{ margin: "0 0 6px", fontSize: 24, color: "#0f172a", letterSpacing: -0.02 }}>
          {safeString(profile.name) || "Business profile"}
        </h1>
        {profile.websiteUrl ? (
          <a
            href={profile.websiteUrl}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 14, color: "#2563eb", wordBreak: "break-all" as const }}
          >
            {profile.websiteUrl}
          </a>
        ) : null}
        <div style={meta}>
          {pagesScraped != null ? <span>Pages scraped: {pagesScraped}</span> : null}
          {pagesScraped != null && projectId ? <span> · </span> : null}
          {projectId ? <span>Project: {projectId}</span> : null}
          {scrapeRunId ? (
            <>
              {projectId || pagesScraped != null ? <span> · </span> : null}
              <span>Run: {scrapeRunId}</span>
            </>
          ) : null}
        </div>
      </header>

      {safeString(profile.description) ? (
        <div style={section}>
          <h2 style={h2}>Description</h2>
          <p style={p}>{profile.description}</p>
        </div>
      ) : null}

      <div style={section}>
        <h2 style={h2}>Categories</h2>
        <StringList items={profile.categories} empty="None listed" />
      </div>

      <div style={section}>
        <h2 style={h2}>Location & service area</h2>
        <p style={p}>
          {[loc.address, loc.city, loc.region, loc.country].filter(Boolean).join(", ") ||
            "—"}
        </p>
        {profile.serviceArea ? (
          <p style={{ ...p, fontSize: 14 }}>
            <strong style={{ color: "#475569" }}>Service area: </strong>
            {profile.serviceArea}
          </p>
        ) : null}
      </div>

      <div style={section}>
        <h2 style={h2}>Contact</h2>
        {contact.contactPageUrl ? (
          <p style={p}>
            <a href={contact.contactPageUrl} target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>
              {contact.contactPageUrl}
            </a>
          </p>
        ) : null}
        {Array.isArray(contact.emails) && contact.emails.length > 0 ? (
          <p style={p}>
            <strong style={{ color: "#475569" }}>Email: </strong>
            {contact.emails.join(", ")}
          </p>
        ) : null}
        {Array.isArray(contact.phones) && contact.phones.length > 0 ? (
          <p style={p}>
            <strong style={{ color: "#475569" }}>Phone: </strong>
            {contact.phones.join(", ")}
          </p>
        ) : null}
        {!contact.contactPageUrl && !(contact.emails?.length) && !(contact.phones?.length) ? (
          <p style={{ ...p, color: "#94a3b8" }}>No direct contact details extracted.</p>
        ) : null}
      </div>

      {safeString(profile.hours) ? (
        <div style={section}>
          <h2 style={h2}>Hours</h2>
          <p style={p}>{profile.hours}</p>
        </div>
      ) : null}

      <div style={section}>
        <h2 style={h2}>Value propositions</h2>
        <StringList items={profile.valueProps} empty="None listed" />
      </div>

      <div style={section}>
        <h2 style={h2}>Products & services</h2>
        <StringList items={profile.productsServices} empty="None listed" />
      </div>

      <div style={section}>
        <h2 style={h2}>Social & links</h2>
        <StringList items={profile.socialLinks} empty="None listed" />
      </div>

      {Array.isArray(profile.citations) && profile.citations.length > 0 ? (
        <div style={section}>
          <h2 style={h2}>Citations ({profile.citations.length})</h2>
          <p style={{ ...meta, marginTop: 0 }}>
            Snippets the model tied to each field (check against the live site when editing).
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            {profile.citations.map((c, i) => (
              <div key={i} style={card}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>
                  {safeString(c.field) || "field"}
                </div>
                {c.sourceUrl ? (
                  <div style={{ marginTop: 4 }}>
                    <a
                      href={c.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 12, color: "#2563eb", wordBreak: "break-all" as const }}
                    >
                      {c.sourceUrl}
                    </a>
                  </div>
                ) : null}
                {c.snippet ? <div style={citeBox}>{c.snippet}</div> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}
