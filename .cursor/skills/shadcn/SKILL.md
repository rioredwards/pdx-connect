---
name: shadcn
description: shadcn/ui (v4) and CLI usage for this repo—Base UI style, `components.json`, adding primitives. Use when adding or changing UI components under `web/components/ui`.
metadata:
  priority: 5
  docs:
    - "https://ui.shadcn.com/docs"
  pathPatterns:
    - 'web/components.json'
    - 'web/components/ui/**'
    - 'web/components/**/*.tsx'
  bashPatterns:
    - '\bnpx\s+shadcn@latest\b'
    - '\bpnpm\s+dlx\s+shadcn@latest\b'
  promptSignals:
    phrases:
      - "shadcn"
      - "shadcn/ui"
      - "add component"
      - "components.json"
---

## Stack in this project

- **shadcn** v4 with **`style`: `base-nova`** in `web/components.json`.
- Primitives live under **`web/components/ui/`**; aliases use `@/components`, `@/components/ui`, `@/lib/utils`.
- Tailwind entry includes **`@import "shadcn/tailwind.css"`** in `web/app/globals.css`.

## Adding components

- From **`web/`**, use the official CLI, for example: `npx shadcn@latest add button` (add only what you need).
- Prefer **existing `components/ui` patterns** (imports, variants, `cn`) when composing new screens; do not hand-roll radix-level primitives if a shadcn block already fits.
- Keep **server vs client** boundaries aligned with Next.js: mark files with `"use client"` when using hooks or browser-only APIs.

## Composition

- Use **`cn()`** for class merging; use **CVA** (`class-variance-authority`) the same way generated components do when adding variants.
- **Icons**: project uses **lucide-react** per `components.json`.

## Docs

Component catalog and CLI: [shadcn/ui documentation](https://ui.shadcn.com/docs).
