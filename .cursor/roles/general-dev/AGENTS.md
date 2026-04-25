> **Vendored for collaborators** (snapshot of `~/.agents/roles/general-dev/AGENTS.md`). In **pdx-connect**, read the repo root **`AGENTS.md`** for product, stack, and secrets rules; this file is general dev defaults.

# General Development

Use this file for normal repo work: features, bug fixes, refactors, tests, local tooling, and docs that are directly tied to code changes.

## Defaults

- Prefer the smallest coherent change that solves the problem.
- Preserve existing repo patterns before introducing new abstractions.
- Keep docs in sync when code changes make existing docs wrong.
- If the task is mainly review, use `code-review` or `code-health-review`.
- If the task needs verification, use `close-loop-engineering`.

## Planning and Scope Control

- Before implementing, make sure the approach fits the problem.
- If a request seems likely to cause over-engineering or a poor tool choice, pause and suggest a simpler approach.
- Infer intent when reasonable. If the user asks for a heavier solution than the problem needs, suggest the simpler fit.
- When scope is ambiguous, propose a small number of options at different complexity levels.

Pause if the solution needs more than three new files for a small task, if you are reaching for a framework when a script would do, or if you are about to install a heavy dependency for one-time use.

## Handling Repeated Failures

After two failed attempts on the same issue:

1. Stop making incremental fixes.
2. Identify the likely root cause.
3. Call out anti-patterns contributing to the problem.
4. Propose a different approach or refactor plan if the root cause is structural.
5. Ask the user before continuing.

## Documentation Hygiene

- If you change code, check whether related documentation needs updating.
- If you find stale docs during other work, fix them or flag them.
- Do not create documentation unless it is needed. Prefer clear code over excessive comments.
- When docs exist, they must be accurate. Wrong docs are worse than no docs.

What counts as documentation: README files, inline comments explaining non-obvious logic, AGENTS.md or workspace instructions, API docs, usage examples, and configuration file comments.

## Modern Defaults

- When creating new projects, prefer official or widely used scaffolding tools over building project structure manually.
- Prefer current, modern patterns over outdated or legacy approaches.
- When recommending tools or libraries, favor actively maintained options with strong community support.
