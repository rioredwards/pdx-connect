---
name: close-loop-engineering
description: Implement code changes and verify they actually work by running the full project feedback loop: lint/typecheck/tests/build/runtime smoke checks, then fix failures until green with evidence. Use when user asks to "close the loop", "verify it works", "ship safely", or requests feature work with validation.
---

# Close-Loop Engineering

## Goal
Ship working changes, not just written code.

## Workflow
1. Define success criteria in 1-5 bullets before coding.
2. Identify project validation commands from package scripts, Makefile, CI config, or language defaults.
3. Implement in small increments.
4. Run validation loop after each meaningful change:
   - lint
   - typecheck/static analysis
   - unit/integration tests
   - build
   - runtime smoke check (CLI run, HTTP health check, or UI render path)
5. If anything fails, fix and rerun only affected checks first, then rerun full gate.
6. Stop only when all required checks pass or blockers are clearly documented.

## Command Discovery Order
Use project-native commands first:

1. Existing scripts/tasks (`package.json`, `Makefile`, `justfile`, CI yaml)
2. Existing test tooling in repo docs
3. Language defaults as fallback

Never invent fake success. If no test harness exists, add a minimal reproducible smoke test when practical.

## Evidence Format (required in final response)
Include a compact verification block:

- **Scope:** what changed
- **Checks run:** exact commands
- **Results:** pass/fail summary
- **Artifacts:** key output snippets, URLs, screenshots, or test files added
- **Residual risk:** what remains unverified

## Fast Defaults by Stack (fallback only)
- Node: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`
- Python: `ruff check .`, `mypy .`, `pytest`, package build command
- Swift: `xcodebuild test` (or project test command), build target
- Rust: `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`, `cargo build`

Use only commands that exist in the repo/toolchain.

## Runtime Smoke Patterns
Pick at least one when relevant:
- CLI: run command with representative args
- API: boot app and hit health endpoint/basic route
- Web UI: load key route and confirm no console/runtime error
- Worker/job: execute one controlled run with sample input

## Guardrails
- Do not claim done without showing checks.
- Do not skip failing checks silently.
- Do not over-expand scope while fixing unrelated failures; note follow-ups separately.
