---
name: tailwind
description: Tailwind CSS v4 guidance for this repo (PostCSS pipeline, @theme, shadcn integration). Use when editing utility classes, global theme tokens, or CSS in `web/app/globals.css`.
metadata:
  priority: 5
  docs:
    - "https://tailwindcss.com/docs"
  pathPatterns:
    - 'web/app/**/*.css'
    - 'web/**/*.tsx'
    - 'web/postcss.config.*'
  promptSignals:
    phrases:
      - "tailwind"
      - "utility class"
      - "globals.css"
      - "@theme"
---

## Stack in this project

- **Tailwind v4** with `@tailwindcss/postcss` (see `web/package.json`).
- Entry CSS is **`web/app/globals.css`**: `@import "tailwindcss"`, `tw-animate-css`, and `shadcn/tailwind.css`.
- Theme extensions use **`@theme inline`** and CSS variables (often aligned with shadcn tokens).

## Practices

- Prefer **utilities in JSX** for layout and spacing; use **`globals.css`** for design tokens, `@theme`, and global base styles.
- Use **`cn()`** from `@/lib/utils` (clsx + tailwind-merge) when merging conditional classes.
- Respect **dark mode** via the patterns already in `globals.css` (e.g. `.dark` / `dark` variant conventions the file defines).
- For new animations, prefer **`tw-animate-css`** or CSS in theme scope before adding heavy JS animation libraries.
- After changing **`@theme`** or imports in `globals.css`, run lint/build from `web/` if classes look missing (stale dev server).

## Docs

Official reference: [Tailwind CSS documentation](https://tailwindcss.com/docs).
