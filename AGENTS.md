# AGENTS.md — sovereign-plugin-ledger

Guidance for Claude Code (and other agents) working in this repository.

## What this is

**Ledger** — a budget-based personal finance tracker, built as an
installable plugin for the
[Sovereign](https://github.com/sovereignfs/sovereignfs) platform
(`fs.sovereign.ledger`).

## Where this runs

This repo has no build/test/lint tooling of its own — `package.json` has
only a `typecheck` script, and both it (`@sovereignfs/sdk`,
`@sovereignfs/ui`, `@sovereignfs/tsconfig`, all `workspace:*`) and
`tsconfig.json` (extends `@sovereignfs/tsconfig/nextjs.json`) depend on
packages that only resolve inside a `sovereignfs/sovereignfs` monorepo
checkout's pnpm workspace.

Develop this plugin by cloning this repo into that monorepo at
`plugins/<slug>.local/` (the trailing `.local` marks it as a locally-cloned
dev plugin — see that repo's `docs/plugin-development.md`) and running the
monorepo's own commands from its root, filtered to this package where
useful:

```bash
pnpm install                                    # resolves workspace: deps
pnpm dev                                         # composes + hot-reloads this plugin
pnpm --filter sovereign-plugin-ledger typecheck
pnpm lint / pnpm format:check / pnpm design:tokens:check   # repo-wide, not per-plugin
```

`.local` plugin directories are gitignored by the monorepo, so this repo's
own git history (not the monorepo's) is this plugin's only version control
while it lives there.

## Source of truth

Read the relevant doc before any task — these are authoritative over
assumptions:

- [`CONCEPT.md`](CONCEPT.md) — product concept and the design decisions
  already locked in (multi-currency with pivot-rate storage, saving jars as
  real sub-accounts, unified People ledger, per-user-only scope).
- [`SPEC.md`](SPEC.md) — technical spec: architecture, data model, and
  every task (`L.1`–`L.13`) with its goal, deliverables, dependencies, and
  review checklist.
- [`ROADMAP.md`](ROADMAP.md) — prioritized build order, one row per task.
- [`docs/adhoc/`](docs/adhoc/) — wireframes this plugin is built against:
  `web-shell.md` (desktop `ThreeColumnLayout`), `mobile-fork.md` (the
  `ResponsiveSurface` mobile tree), `setup-wizard.md` (first-run onboarding).

## Task workflow

**One task at a time.** Implement a single `L.<n>` task, verify its SPEC
review checklist, then stop. Tasks are sequenced — each depends on the
previous unless SPEC marks it `[parallel]`. Don't skip ahead without being
told which task to pick up next.

Per-task loop:

1. Read the task's Goal/Deliverables/Dependencies/Review checklist in
   `SPEC.md`.
2. If it introduces a new screen or a materially new layout not already
   covered by a `docs/adhoc/` wireframe, produce one first and get it
   signed off.
3. Implement, following the conventions below.
4. **Verify live in a browser**, not just via typecheck/lint.
5. Run the full check suite (typecheck, lint, format:check, design tokens)
   and show the output.
6. Bump `manifest.json`'s `version`, mark the task done in `ROADMAP.md`,
   and add a status entry to `SPEC.md`'s `Status` section — in that order.

## Conventions (inherited from the host platform, still binding here)

This plugin is a guest in the Sovereign platform's runtime — these rules
exist to keep it a well-behaved one. Full rationale for each lives in the
platform repo's `docs/architecture-rules.md`.

- **SDK boundary:** import only `@sovereignfs/sdk` and `@sovereignfs/ui`.
  Never reach into the platform's `runtime/src` — the monorepo's ESLint
  config enforces this at lint time.
- **Every server action** starts with `sdk.auth.requireSession()`, then
  checks that the row's `tenant_id` equals the session's user id. Ledger is
  strictly single-user — there is no membership/role model to check,
  unlike a shared-resource plugin. Route-level gating is never sufficient
  on its own.
- **Mutations return `ActionResult`** — domain failures are values, never
  thrown.
- **`ledger_fx_rates` is the one deliberately untenanted table** — exchange
  rates are public, instance-wide data. Every other table carries
  `tenant_id`. Don't "fix" this into being tenant-scoped; it's intentional.
- **Jar and people transaction amounts are signed** (not a direction enum
  plus an always-positive magnitude) — see `SPEC.md`'s Data model section.
- **A jar-funded expense produces exactly one row** (a
  `ledger_jar_transactions` withdrawal), never also a `ledger_transactions`
  row — this was a real design bug caught and fixed before `SPEC.md` was
  written; don't reintroduce it.
- **Design system only:** components and semantic `--sv-*` tokens from
  `@sovereignfs/ui`, never hardcoded colors or bespoke primitives —
  `pnpm design:tokens:check` (run from the monorepo root) enforces this.
- **User-facing copy says "budgeted"/"spent"/"subcategory,"** never
  "predicted"/"actual"/"kind" — see `SPEC.md`'s Terminology section.
- **Plugins version only `manifest.json`.** `package.json`'s `version`
  stays pinned at `0.0.0` forever.

## Status

Current manifest version: see `manifest.json` / `ROADMAP.md`'s header. Task
history and the reasoning behind every completed task lives in `SPEC.md`'s
`Status` section — that's the changelog; don't duplicate it here.
