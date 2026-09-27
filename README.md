# Ledger

A budget-based personal finance tracker, built as an installable plugin for
the [Sovereign](https://github.com/sovereignfs/sovereign) platform
(`fs.sovereign.ledger`).

**Status: Phase 1 complete (L.1–L.15).** Setup wizard, Overview, Budget,
expense entry (with edit/delete), Accounts (full balance sheet with in-place
edits), Reports with month-end review, saving jars, rule-based insights,
Settings, a daily FX-rate job, and a month-end recap email/notification — on
both the desktop and mobile shells. See [`ROADMAP.md`](ROADMAP.md) for what
is tracked next.

## What it is

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

| Permission           | Why                                                              |
| -------------------- | ---------------------------------------------------------------- |
| `auth:session`       | Every action is scoped to the signed-in user's own budget data.  |
| `db:readWrite`       | Own isolated database for all budget/account/transaction tables. |
| `mailer:send`        | The 1st-of-month recap email (task L.11).                        |
| `notifications:send` | The in-app counterpart to that recap (task L.11).                |
| `data:export`        | Include your budget in an account data export.                   |
| `data:import`        | Restore a budget from an exported bundle.                        |

## Your data

**Export and restore.** Everything Ledger stores for you travels in the
platform's own account data export (Account → Data): currencies, incomes,
categories and subcategories, expenses, saving jars and their history,
accounts, cards, assets, deposits, loans, people and their ledgers, and
which months you have reviewed. Restoring a bundle re-creates all of it,
remapping internal references so nothing points back at the instance it came
from. Exchange rates are not included — they are shared, instance-wide
reference data rather than anything of yours, and are re-fetched daily
wherever you restore to. The "recap already sent" markers are left out too:
they are operational state rather than something you wrote, so the next
monthly recap simply sends normally on the new instance.

**Account deletion.** If your account is deleted — by you or by an admin —
Ledger deletes every row it holds for you, across all of its tables. It
never touches another user's rows, and it leaves the shared exchange-rate
table alone. There is no attribution to sever: Ledger is strictly
single-user, so no row here is ever owned by one person and attributed to
another.

## Running it locally

This repo has no build/test/lint tooling of its own — it depends on
packages that only resolve inside a `sovereignfs/sovereign` monorepo
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

Same license as the [Sovereign platform](https://github.com/sovereignfs/sovereign).
