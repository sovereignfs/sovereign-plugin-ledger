# Ledger

A budget-based personal finance tracker, built as an installable plugin for
the [Sovereign](https://github.com/sovereignfs/sovereignfs) platform
(`fs.sovereign.ledger`).

**Status: scaffold only (task L.1).** No data model, no real screens yet —
see [`ROADMAP.md`](ROADMAP.md) for what's next.

## What it will be

Set up a budget once (currencies, incomes, fixed/dynamic expense
categories, saving plans, and a full balance sheet of accounts, cards,
assets, deposits, loans, and people), then track actual spending against
it, review monthly, and get a net-worth-aware picture of where things
stand. Genuinely multi-currency, self-hosted, strictly single-user.

See [`CONCEPT.md`](CONCEPT.md) for the full product concept,
[`SPEC.md`](SPEC.md) for the technical design and data model, and
[`docs/adhoc/`](docs/adhoc/) for the wireframes this was designed against.

## Permissions

Declared in [`manifest.json`](manifest.json):

| Permission           | Why                                                                 |
| --------------------- | --------------------------------------------------------------------|
| `auth:session`        | Every action is scoped to the signed-in user's own budget data.     |
| `db:readWrite`        | Own isolated database for all budget/account/transaction tables.    |
| `mailer:send`         | The 1st-of-month recap email (task L.11).                           |
| `notifications:send`  | The in-app counterpart to that recap (task L.11).                   |

## Running it locally

This repo has no build/test/lint tooling of its own — it depends on
packages that only resolve inside a `sovereignfs/sovereignfs` monorepo
checkout's pnpm workspace. Clone it into that monorepo at
`plugins/<slug>.local/` (the trailing `.local` marks it as a locally-cloned
dev plugin — see the platform repo's `docs/plugin-development.md`), then
from the monorepo root:

```bash
pnpm install
pnpm dev
```

`pnpm dev` composes this plugin into the running Sovereign shell and
hot-reloads on changes. Visit `/ledger` on your dev instance.

```bash
pnpm --filter sovereign-plugin-ledger typecheck
pnpm lint / pnpm format:check / pnpm design:tokens:check   # repo-wide, not per-plugin
```

See this plugin's own [`CLAUDE.md`](CLAUDE.md) for the full development
workflow and conventions.

## License

Same license as the [Sovereign platform](https://github.com/sovereignfs/sovereignfs).
