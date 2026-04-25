> **Vendored for collaborators** (snapshot of `~/.agents/AGENTS.md`). In this repo, **read root `AGENTS.md` first** for pdx-connect rules. If you also use the maintainer’s `~/.agents`, the files below are equivalent or supplemental. **Do not** use the Self-Improvement skill or `.learnings/` here (omitted to stay lean).

# Global Agent Instructions

## Get your instructions

1. **Always in this repo:** this file (`GLOBAL-AGENTS.md`) for global defaults, then root **`AGENTS.md`** for project rules. If you use **`~/.agents/AGENTS.md`**, that is the home copy of similar content.
2. **When the task matches a role, also read** that role’s `AGENTS.md`:
   - **General development:** in-repo **`.cursor/roles/general-dev/AGENTS.md`**, or `~/.agents/roles/general-dev/AGENTS.md` if you have it.
   - **System and workflows** (rare in this repo): `~/.agents/roles/system-and-workflows/AGENTS.md` if present.

Load at most one role unless the work clearly spans both. Other roles may exist under `~/.agents/roles/` over time.

## Context Model

Keep this file minimal.

- **Global instructions:** rules that apply to almost every task.
- **Role files:** stable domain context loaded only when the task matches.
- **Skills:** detailed procedures, checklists, and report formats loaded on demand.

If a role or skill owns guidance, global should point to it, not restate it.

## General Rules

Below are general rules that apply to all roles:

### No Em Dashes

Do not use the em dash character anywhere, ever. NO EXCEPTIONS.

### Use `trash` instead of `rm`

When deleting files or directories, use the macOS `trash` command (e.g. `trash file.txt`) instead of `rm` or `rm -rf`. This sends items to the Trash, making deletions recoverable. Only use `rm` when there is a specific reason the Trash is inappropriate (e.g. cleaning up temporary build artifacts in CI).

### AGENTS.md Convention

Use `AGENTS.md` as the canonical file for all AI agent instructions, at both project and global levels. Never create tool-specific instruction files (e.g. `.cursorrules`, `CLAUDE.md`, `copilot-instructions.md`) as primary sources. Instead, symlink them to `AGENTS.md`.

#### Project level

- `AGENTS.md` at the repo root is the single source of truth.
- For specific agent conventions, symlink to `AGENTS.md`. For example: `ln -sf AGENTS.md CLAUDE.md`

#### Global level

- `~/.agents/AGENTS.md` is the canonical global file.
- Symlinks:
  - `~/.codex/AGENTS.md` -> `~/.agents/AGENTS.md`
  - `~/.claude/CLAUDE.md` -> `~/.agents/AGENTS.md`
  - `~/.config/opencode/AGENTS.md` -> `~/.agents/AGENTS.md`
  - `~/.openclaw/AGENTS.md` -> `~/.agents/AGENTS.md`

#### When creating new projects

Always create `AGENTS.md` first, then add symlinks as needed. Never put instructions in a tool-specific file without symlinking it back to `AGENTS.md`.

### Self-Improvement

Not used in this repository (see note at top of this file). On other projects, the upstream `~/.agents/AGENTS.md` may recommend `.learnings/` and the `self-improvement` skill.

### Git Safety Rules

- Never stage everything blindly if the diff looks suspicious.
- Never perform destructive history edits casually.
- Never claim work is saved without verifying commit success.
- If something looks risky (secrets, credentials, giant files), pause and explain the concern before proceeding.

### Cleanup After Yourself

Before declaring a task done, audit your own changes and remove anything that is not part of the solution -- exploratory edits, wrong-turn changes, and anything added under a false hypothesis. If it is not load-bearing, cut it.

### Close the Loop

For non-trivial implementation work, or when the user asks to verify readiness, use the `close-loop-engineering` skill.

### Code Health Review

For maintainability or code health audits, use the `code-health-review` skill.

For PR-focused, diff-focused, or checklist-heavy review work, use the `code-review` skill instead.

### Agent Self-Maintenance

- Offer to persist stable preferences in `AGENTS.md`, role files, workspace rules, or project config.
- When a pattern will recur, prefer a role file, skill, or small automation over repeating the same guidance manually.
- After setup or plumbing work, take the friction-reducing next step, such as adding a symlink, validation check, or small guardrail.
- When stuck or circling, pause and involve the user instead of grinding.

## Token Efficiency

Work efficiently without reducing quality.

- Avoid unnecessary token use: do not repeat large blocks of context, do not re-read files already read, do not generate verbose output when concise output serves.
- Prefer targeted file reads over reading entire directories.
- Prefer concise summaries over exhaustive listings when the user needs an overview.
- When useful, suggest lightweight ways to reduce repeated context loading: project index files, directory maps, workflow notes.

## Tone and Communication

- Be clear, practical, and efficient.
- Focus on useful guidance over hype or filler.
- Keep the user moving forward without overwhelming them.
- Lead with the answer or action, not the reasoning.
- If you can say it in one sentence, do not use three.
