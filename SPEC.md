# Ledger — Phase 1 Technical Spec

> Technical design and task breakdown for the Phase 1 concept in
> [CONCEPT.md](CONCEPT.md), refined against three wireframe passes
> ([`docs/adhoc/web-shell.md`](docs/adhoc/web-shell.md),
> [`docs/adhoc/mobile-fork.md`](docs/adhoc/mobile-fork.md),
> [`docs/adhoc/setup-wizard.md`](docs/adhoc/setup-wizard.md)). Tasks follow
> the platform epic format: one task = one branch = one PR, sequenced
> unless tagged `[parallel]`. Prioritized build order lives in
> [ROADMAP.md](ROADMAP.md).

## Status

✅ **L.1 shipped (0.1.0)** — plugin scaffold: `manifest.json` (no
`shellConfig` yet, per the deferral decision in this doc's Plugin identity
section), `package.json`/`tsconfig.json`/`css-modules.d.ts` mirroring
`sovereign-plugin-kanban.local`'s shapes, a Lucide-style wallet `icon.svg`,
and a placeholder `app/page.tsx` inside `PageContainer`/`PageHeader`.

Verified live, not just via the check suite: `pnpm dev` composes 9 plugins
including Ledger; the Launcher shows its tile with the correct name and
description; `/ledger` renders the placeholder inside the platform's
default shell with zero console errors. `pnpm generate`,
`pnpm --filter sovereign-plugin-ledger typecheck`, `pnpm lint`,
`pnpm format:check`, and `pnpm design:tokens:check` all pass clean.

Two environment issues found and fixed along the way, neither caused by
this plugin's own code:

- **Two orphaned `next-server` processes from earlier dev-server runs**
  were holding ports 3002/3003/5021 and 5020, the last one unresponsive to
  HTTP entirely (confirmed via a timed-out `curl` before killing it) —
  cleared so `pnpm dev` could bind cleanly.
- **`.claude/launch.json`'s `dev` entry declared port `3000`**, but this
  pod's own `.env` sets `RUNTIME_PORT=5020` (overriding the documented
  `3000` default in `.env.example`) — the preview tooling's port
  allowlist was denying connections to the actual port the app binds.
  Fixed by updating `launch.json` to `5020` to match this pod's real
  configuration.

🚧 L.2 (data model & migrations) is the next task, not started.

---

## Architecture

### Terminology

Internal/schema vocabulary differs from user-facing copy in two places,
deliberately: **"Predicted"** (schema/code) is shown to users as
**"Budgeted"**; **"Kind"** (schema/code, the level below Category) is shown
as **"Subcategory"**. "Actual" is shown as **"Spent"**. Code, types, and
column names keep the schema terms (`predictedAmount`, `ledger_kinds`) —
only user-visible strings use the translated ones. "Dynamic" and "Fixed"
are schema/internal category types with no distinct user-facing label at
all — both render as plain categories in one grouped Budget list (see
`web-shell.md` screen 3). "Saving Jar" is used as-is everywhere; it was
already plain language.

### Plugin identity

- **id:** `fs.sovereign.ledger` (table slug prefix `ledger_`)
- **routePrefix:** `/ledger`
- **type:** `sovereign` (first-party plugin maintained by the project,
  installed from its own repo; requires a `repository` URL)
- **shell:** `default`. No `shellConfig` until L.9 — a placeholder page has
  nothing to self-render yet, and setting `mobileHeader`/`mobileFooter:
  false` prematurely would leave mobile users with zero nav chrome for the
  several tasks in between (a real regression, not a cosmetic one; caught
  in this spec's own validation pass before being written down).
- **Versioning:** the plugin's version lives only in `manifest.json`;
  `package.json` stays pinned at `0.0.0` forever.

### Manifest permissions

- `auth:session` — session reads via `sdk.auth`
- `db:readWrite` — isolated database (the only mode for `type: sovereign`;
  see Data model)
- `mailer:send` — the month-end recap email (L.11)
- `notifications:send` — the month-end in-app notification (L.11)

All four declared from L.1 even though `mailer:send`/`notifications:send`
aren't used until L.11 — same precedent as Kanban declaring
`notifications:send` in its own first task, ten tasks before Inbox shipped.

No `schedules` entry yet — added at L.10 when the FX-rate job is actually
built. `schedules` is a plain manifest field, not a permission; it needs no
separate permission grant of its own.

### SDK usage

| Surface                     | Use                                                          |
| ---------------------------- | ------------------------------------------------------------ |
| `sdk.auth.requireSession()` | First line of **every** server action                        |
| `sdk.db.getClient()`        | Plugin's isolated DB (zero-argument invariant — never work around it) |
| `sdk.mailer.send()`         | Month-end recap email (L.11)                                 |
| `sdk.notifications.send()`  | Month-end in-app notification (L.11)                          |

No `sdk.directory` or any multi-user/membership surface — Ledger is
strictly single-user (confirmed directly, not a phased deferral), so every
authorization check is just "this row's `tenant_id` matches the caller's
session," never a membership or role check.

### Hard platform rules that apply here

- **SDK boundary:** import only `@sovereignfs/sdk` and `@sovereignfs/ui` —
  never `runtime/src` (ESLint-enforced).
- **Every server action authorizes inside the action**
  (`sdk.auth.requireSession()`, then the row's `tenant_id` must equal the
  session's user id) — route-level gating is never sufficient.
- **All tables slug-prefixed `ledger_`; `tenant_id` on every user-scoped
  table** — except `ledger_fx_rates`, deliberately untenanted (see Data
  model).
- Page padding/max-width come from `PageContainer` — no local root
  padding/max-width.
- Quick-entry inputs that commit on Enter must also commit on blur
  (`useCommitOnEnterOrBlur`) — relevant to the Add-expense dialog's amount
  and note fields.
- Only `--sv-*` semantic tokens in CSS; no hardcoded colors
  (`pnpm design:tokens:check` enforces).
- User-facing strings say **budgeted/spent/subcategory**, never
  **predicted/actual/kind** (see Terminology above).

---

## Data model

All tables live in Ledger's isolated plugin database. `type: sovereign` →
`manifestDatabaseIsolation()` (`packages/manifest/src/schema.ts`) is
**unconditionally** `'isolated'` for any non-`platform` plugin type — this
is not a manifest field and not a design choice to make; it resolves
CONCEPT.md's "DB isolation mode" open question outright. `tenant_id`
(= the owning user's id) scopes every table **except** `ledger_fx_rates`,
which is deliberately untenanted: exchange rates are public, instance-wide
data, same rationale already used by `sovereign-plugin-sheets.local`'s own
`finance_rate_cache`.

```
ledger_currencies          id, tenant_id, code, is_base, timestamps
ledger_fx_rates            [UNTENANTED] id, currency_code, pivot_code, rate,
                           as_of_date, source (nullable)
ledger_incomes             id, tenant_id, label, amount, currency,
                           kind ('primary' | 'secondary'), timestamps
ledger_categories          id, tenant_id, name, type ('dynamic' | 'fixed' | 'saving'),
                           timestamps
ledger_kinds               id, tenant_id, category_id, name, predicted_amount,
                           currency, recurrence_interval_unit, recurrence_interval_count,
                           recurrence_anchor_date (fixed-type only, else null),
                           timestamps
ledger_transactions        id, tenant_id, kind_id, amount, currency,
                           occurred_at, note, timestamps
ledger_saving_jars         id, tenant_id, kind_id, balance, currency, timestamps
ledger_jar_transactions    id, tenant_id, jar_id, amount (signed), category_id
                           (nullable), note, occurred_at
ledger_accounts            id, tenant_id, name, institution (nullable),
                           type ('bank' | 'credit_card'), balance, currency,
                           credit_limit (nullable), timestamps
ledger_assets              id, tenant_id, name, type ('physical' | 'security'),
                           value, currency, timestamps
ledger_deposits            id, tenant_id, name, amount, currency, timestamps
ledger_loans               id, tenant_id, name, lender, principal,
                           remaining_balance, installment_amount, currency,
                           start_date, end_date, linked_kind_id, timestamps
ledger_people              id, tenant_id, name, balance (cached, signed),
                           currency, timestamps
ledger_people_transactions id, tenant_id, person_id, amount (signed), note,
                           occurred_at
ledger_period_reviews      tenant_id, year, month, reviewed_at (not null)
```

Indexes: `ledger_transactions(tenant_id, kind_id, occurred_at)`,
`ledger_jar_transactions(tenant_id, jar_id, occurred_at)`,
`ledger_people_transactions(tenant_id, person_id, occurred_at)`,
`ledger_fx_rates` unique on `(currency_code, pivot_code, as_of_date)` plus a
lookup index on `(currency_code, pivot_code, as_of_date desc)` for "the rate
in effect on this transaction's date," and `ledger_period_reviews` unique on
`(tenant_id, year, month)`.

Timestamps (`created_at`/`updated_at`) on every table that has them above;
`ledger_jar_transactions`/`ledger_people_transactions`/`ledger_period_reviews`
are append-only/single-write rows and only carry `occurred_at`/`reviewed_at`.
No soft-delete in Phase 1 — deletes cascade. Postgres timestamp columns use
`bigint({ mode: 'number' })`, never plain `integer`, per this app family's
own established rule (a 13-digit Unix-ms value overflows Postgres's 32-bit
`integer`).

**Design notes and corrections** (an earlier draft of this schema was
validated against every wireframe screen before being written down here;
these four points changed real behavior, not just shape):

1. **People have a transaction history**
   (`ledger_people_transactions`), not a flat mutable balance.
   `web-shell.md` describes a selected person's detail column the same way
   as a jar's — "a person's ledger" — which needs a history to render, not
   just a running total. `ledger_people.balance` is a cached, denormalized
   sum, kept in sync transactionally on every insert into
   `ledger_people_transactions` — read-path convenience, not the source of
   truth.
2. **`ledger_accounts` carries `institution` separately from `name`** — the
   wireframe shows `Checking · Primary Bank` as two distinct pieces.
3. **A jar-funded expense is not double-booked.** There is no
   `funded_from_jar_id` on `ledger_transactions`. Per CONCEPT.md, funding an
   expense from a saving jar is a withdrawal **instead of** logging a
   dynamic expense — it produces exactly one `ledger_jar_transactions` row
   (carrying `category_id` and `note` so it still surfaces correctly in a
   "recent activity" feed), never a row in both tables. An earlier draft of
   this schema had the field; it would have silently double-subtracted the
   same spend from Reports' "actual savings" figure.
4. **`ledger_period_reviews` only has rows for reviewed periods** — no
   nullable `reviewed_at` on a pre-populated per-period row, no backfill
   job. "Needs review" (`web-shell.md` screen 5 / `mobile-fork.md` screen 6)
   is simply the absence of a row for a past `(tenant_id, year, month)`.

**Jar and people transaction amounts are stored signed** (positive =
contribution / increases what's owed to the user; negative = withdrawal /
increases what the user owes), not a direction enum plus an always-positive
magnitude — simpler, and matches how the source spreadsheet this plugin is
modeled on already displayed jar deltas as signed numbers.

**Known v1 limitation, stated explicitly rather than left implicit:**
`predicted_amount` is a single mutable value on `ledger_kinds`, with no
effective-dating. Revising a budget at month-end review changes what an
earlier period's report would show if it were regenerated later. CONCEPT.md
already flagged this as open; this schema does not resolve it — a future
task would need an effective-dated history table if this becomes a real
problem in practice.

---

## Data fetching contract

Five payloads, one per top-level route; server components fetch, `loading.tsx`
per route segment gates it. Mutations are server actions returning the
platform `ActionResult` shape, consumed via `useActionState`.

1. **Setup wizard payload** (L.4) — nothing to fetch on entry; three
   sequential creates (currency, income, categories+kinds) on submit.
2. **Overview payload** (L.5) — this month's income/spent/projected-saved,
   net worth total, top budget categories with predicted/actual, up to a
   few rule-based insights (computed, not stored — L.13), recent
   transactions. One round trip; before L.4's minimum is met, this becomes
   the setup-checklist payload instead (which sections are non-empty).
3. **Budget payload** (L.5) — every category grouped by type (Dynamic/
   Fixed/Saving, the last populated only once L.12 ships) with each kind's
   predicted vs. actual-this-period; **selected kind's detail** (client
   `useState`, not a route — see Routes) fetched on selection: subcategory
   breakdown, recent transactions in that kind.
4. **Accounts payload** (L.7) — every balance-sheet entity grouped by type,
   plus the net worth total; **selected entity's detail** (client state,
   shape varies by entity type) fetched on selection.
5. **Reports payload** (L.8) — period list (most recent first) with income/
   spent and review status per period; **selected period's detail** (client
   state): the three savings figures (projected / actual / actual-net-of-
   jars), category breakdown, insights, and review actions when applicable.

## Routes

```
/ledger                 Setup wizard (until L.4's minimum is met) or Overview   [web + mobile]
/ledger/budget          Budget                                                 [web + mobile]
/ledger/accounts        Accounts                                               [web + mobile]
/ledger/reports         Reports                                                [web + mobile]
/ledger/settings        Settings
```

No per-item sub-routes. Detail-column/drill-down selection is client
`useState` on both web (the `ThreeColumnLayout` third child, mirroring
`example-plugins/example-layouts`' generic `ThreeColumnDemo.tsx` pattern —
not Tally's own parallel-route variant) and mobile (the `step`-state stack,
matching `MobileStackedDemo.tsx` exactly, already verified and documented
in `mobile-fork.md`). Deep-linking a specific budget category or account
isn't a real requirement for a strictly single-user, private plugin the way
it is for Tally's shared-group use case — kept simple rather than matching
Tally's heavier pattern by default.

## UI composition (Design System)

| Need                          | DS surface                                                    |
| ------------------------------ | -------------------------------------------------------------- |
| Page chrome                   | `PageContainer`, `PageHeader`                                  |
| Web layout                    | `ThreeColumnLayout` (`sidebarWidth={240}`, conditional 3rd child) |
| Mobile layout (L.9)           | `ResponsiveSurface`, self-rendered `MobileHeader`/`MobileFooter` |
| Budget/predicted-vs-spent bars | `Progress`                                                      |
| Signed amounts (People)       | `BalanceChip`                                                   |
| Add expense                   | `Dialog` (`size="md"`) on web; `Drawer` on mobile               |
| Amount entry                  | `CurrencyInput`                                                 |
| Review status                 | `StatusBadge`                                                   |
| Month-end nudge               | `SystemBanner`                                                  |
| Setup wizard category chips   | Design System Gap Check at L.4 — confirm whether a tappable
selection-chip primitive already exists in `packages/ui` before building one locally |
| Empty / loading                | `EmptyState`, `Spinner`                                        |
| Confirmation                   | `ConfirmDialog`                                                 |

Anything reusable Ledger would otherwise invent should be checked against
`packages/ui` first per the DS-first rule; if genuinely missing, that's a
platform DS proposal, not a plugin-local component.

---

## Tasks

Task IDs `L.<seq>` are stable identifiers. One task = one branch = one PR.
Sequenced unless tagged `[parallel]`. Every PR bumps `manifest.json`'s
version per the change (never `package.json`).

Common review checklist (implied for every task, in addition to each task's
own): `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` and
`pnpm design:tokens:check` pass; no `runtime/src` imports; user-facing copy
says "budgeted/spent/subcategory," never "predicted/actual/kind."

---

#### L.1 — Plugin scaffold & manifest

**Goal:** A composed, routable plugin skeleton with the decided manifest.

**Deliverables:**

- `manifest.json` (id `fs.sovereign.ledger`, routePrefix `/ledger`,
  permissions `auth:session`/`db:readWrite`/`mailer:send`/
  `notifications:send`, no `shellConfig` yet), `package.json` pinned
  `0.0.0`, `app/` with a placeholder home page inside `PageContainer`.
- Plugin icon per the icon system.
- Composes under `pnpm dev`; tile appears in Launcher.

**Dependencies:** none.

**Review checklist:** plugin loads at `/ledger` in dev; manifest validates
(`pnpm generate` clean); mobile shows the platform's default header/footer
with no regression on other routes.

---

#### L.2 — Data model & migrations

**Goal:** The full Phase 1 schema (all tables above), migrated and
queryable on both dialects.

**Deliverables:**

- Drizzle schema for every `ledger_*` table per the Data model section,
  including the indexes listed there.
- Generated migrations for both SQLite and Postgres
  (`app/_db/schema.ts` + `app/_db/schema.postgres.ts`,
  `migrations/{sqlite,postgres}/`).
- A currency-agnostic helper for "the FX rate in effect as of a given date"
  (reads `ledger_fx_rates` ordered by `as_of_date desc` ≤ the target date),
  since almost every later task's reporting math depends on it.
- Seed helper for dev (a demo budget: a few categories/kinds, a handful of
  transactions).

**Dependencies:** L.1.

**Review checklist:** migrations run clean on a fresh dev DB on both
dialects; the FX-lookup helper has unit tests covering "no rate yet for
this currency" and "multiple rates, pick the latest ≤ the date."

---

#### L.3 — Server data layer & actions skeleton

**Goal:** The query + mutation layer the setup wizard and core budget loop
build on.

**Deliverables:**

- Query modules for currencies, incomes, categories/kinds (Dynamic and
  Fixed only — **saving-type kind creation is explicitly out of scope
  here**, since it needs L.12's jar-auto-provisioning logic first), and
  transactions.
- Server actions for the same, each starting with
  `sdk.auth.requireSession()` + a `tenant_id`-ownership check, returning
  `ActionResult`.
- Authorization unit tests: a session can never read or mutate another
  user's rows through any action.

**Dependencies:** L.2.

**Review checklist:** authz tests prove cross-tenant denial per action; no
action trusts a client-supplied `tenant_id`; attempting to create a
saving-type kind through this layer is rejected (reserved for L.12).

---

#### L.4 — Setup wizard

**Goal:** The 3-step core wizard per `setup-wizard.md`.

**Deliverables:**

- Base currency step, primary income step, first-categories step
  (suggested chips + pre-filled, editable budget amounts), ready/summary
  step — matching the four wireframed screens exactly.
- Wizard is a full-bleed route outside any shared layout (no
  `ThreeColumnLayout`), per `setup-wizard.md`'s direction.
- Landing on `/ledger` before the wizard's minimum is met shows the
  wizard; after, shows Overview (possibly still in its setup-checklist
  state — see L.5).

**Dependencies:** L.3.

**Review checklist:** wireframe-first already satisfied (this doc); a
fresh user reaches a usable Overview in under a minute; refreshing
mid-wizard doesn't lose currency/income already submitted (each step's
submit is a real mutation, not client-only state).

---

#### L.5 — Web Overview + Budget

**Goal:** The `ThreeColumnLayout` web shell, Overview dashboard (including
its setup-checklist state), and the Budget list+detail screen, per
`web-shell.md` screens 1–3.

**Deliverables:**

- Sidebar (`Overview`/`Budget`/`Accounts`/`Reports`/`Settings`, pinned
  "+ Add expense" button — button opens L.6's dialog once that task ships;
  disabled or hidden until then).
- Overview: populated dashboard and setup-checklist state (checklist rows
  for everything beyond L.4's minimum — accounts, saving plans, etc. — each
  linking to its own not-yet-built section is fine to leave as a disabled/
  "coming soon" row until the corresponding task ships).
- Budget: Dynamic/Fixed sections (Saving section added at L.12), predicted-
  vs-spent bars, kind selection promoting the detail column.

**Dependencies:** L.3. `[parallel]` with L.4 — both build directly on L.3's
actions layer and don't depend on each other.

**Review checklist:** `ThreeColumnLayout` renders 2-column on Overview, 3
only once a Budget kind is selected; ⇄ live-verified at both a fresh
(checklist) and populated account.

---

#### L.6 — Expense entry

**Goal:** The Add-expense overlay — `Dialog` on web, `Drawer` on mobile
(mobile itself isn't built until L.9, but the action/validation logic this
task adds is shared).

**Deliverables:**

- `Dialog` (`size="md"`), corrected from an earlier wireframe draft that
  incorrectly specified `Sheet` (no desktop equivalent, no right-side
  variant) — see `web-shell.md` screen 6's own correction note.
- Amount (`CurrencyInput`), category/subcategory selects, date (defaults to
  today), optional note. The "fund from a saving jar" toggle is visible but
  disabled until L.12 (no jars exist yet).
- Wired to the pinned sidebar button from L.5.

**Dependencies:** L.5 (needs Budget's kind list to populate the
category/subcategory pickers).

**Review checklist:** submitting creates a `ledger_transactions` row
against the right kind; the dialog's amount/note fields commit on blur, not
just Enter (`useCommitOnEnterOrBlur`).

---

#### L.7 — Accounts

**Goal:** The unified net-worth screen per `web-shell.md` screen 4 —
banking, cards, assets, deposits, loans, and people.

**Deliverables:**

- Query/action layer for `ledger_accounts`/`ledger_assets`/
  `ledger_deposits`/`ledger_loans`/`ledger_people`/
  `ledger_people_transactions`.
- Web list+detail screen; detail content shape varies by entity type (a
  loan's schedule/payoff progress; a person's transaction history via
  `BalanceChip`).
- Creating a loan auto-creates its linked Fixed `ledger_kinds` row for the
  installment (`linked_kind_id`) — never entered twice.

**Dependencies:** L.3. `[parallel]` with L.5/L.6 — doesn't depend on Budget
or expense entry, only on L.3's actions-layer pattern.

**Review checklist:** net worth total matches the sum of assets minus
liabilities live-verified against seeded dev data; deleting/editing a loan
correctly updates its linked fixed expense, not a orphaned duplicate.

---

#### L.8 — Reports + month-end review

**Goal:** Period list/detail per `web-shell.md` screen 5, review status
folded in (no separate nav destination).

**Deliverables:**

- Period list (derived from months with any transaction activity, most
  recent first) with income/spent and a `StatusBadge` (`Needs review` /
  `Reviewed`, from `ledger_period_reviews`).
- Selected period's detail: the three savings figures (projected, actual,
  actual-net-of-jars — the last one is 0/inert until L.12 adds jars),
  category breakdown, "Mark reviewed" (inserts a `ledger_period_reviews`
  row) and "Adjust budget" (navigates to `/ledger/budget`, not a duplicate
  editor).

**Dependencies:** L.6, L.7 (needs real transaction and account data to
report on meaningfully).

**Review checklist:** the three savings figures are computed correctly
against seeded multi-month dev data; "Mark reviewed" is idempotent (marking
an already-reviewed period again doesn't error or duplicate a row, given
the unique `(tenant_id, year, month)` constraint).

---

#### L.9 — Mobile fork

**Goal:** The `ResponsiveSurface` mobile tree per `mobile-fork.md` — all of
L.5–L.8's screens, mobile-shaped.

**Deliverables:**

- `shellConfig: { mobileHeader: false, mobileFooter: false }` added to
  `manifest.json` **here** (deferred from L.1 — see Plugin identity).
- Self-rendered `MobileHeader` (per-screen `title`, since the platform
  default shows the instance brand, not a plugin-controlled title —
  confirmed against the real component's source) and `MobileFooter`
  (`Overview`/`Budget` left, `Accounts`/`Reports` right, platform's own
  center launcher).
- FAB "+ Add expense" (no header trailing-action slot exists on
  `MobileHeader`) and an in-content Settings icon on Overview.
- `step`-state drill-down stack per section, hand-rolled back headers
  (`‹ Label`), matching `example-layouts`' `MobileStackedDemo.tsx`.
- `Drawer` (not `Sheet`) for Add-expense on mobile.

**Dependencies:** L.5, L.6, L.7, L.8 — ports already-built web screens'
data/actions into the mobile tree; doesn't introduce new data needs.

**Review checklist:** live-verified at ≤768px in the preview browser and
(if available) a real device/simulator; footer stays pinned through
drill-down navigation; no dead nav (every footer icon and back button
leads somewhere real).

---

#### L.10 — FX rate background job

**Goal:** The daily exchange-rate fetch that makes multi-currency reporting
correct.

**Deliverables:**

- `manifest.json` `schedules` entry (`app/_jobs/fetch-fx-rates.ts`, a
  `ScheduleHandler` default export, `intervalMinutes: 1440`).
- Fetches every supported currency's rate against the pivot currency from
  a no-API-key-required source for fiat (evaluate Frankfurter, already the
  precedent in this app family via `sovereign-plugin-sheets.local`'s
  `FINANCE()`) and a separate source for crypto, writing into
  `ledger_fx_rates` (one row per currency per day).
- Idempotent: re-running the same day is a no-op (unique constraint on
  `(currency_code, pivot_code, as_of_date)`), since the scheduler's
  interval is a floor, not an exact cadence.

**Dependencies:** L.2. `[parallel]`-eligible — no UI dependency, can be
built any time after the schema exists.

**Review checklist:** running the handler twice in the same day inserts
exactly one row per currency, not two; a currency with no rate yet (brand
new) degrades to "no conversion available" rather than crashing report
math.

---

#### L.11 — Month-end report generation

**Goal:** The 1st-of-month recap, delivered by email and in-app.

**Deliverables:**

- `manifest.json` `schedules` entry, gated internally on "is it the 1st,
  and is there no `ledger_period_reviews`-adjacent 'already sent' marker
  for last month yet" (interval floor, not exact cadence — same
  idempotency concern as L.10).
- Reuses L.8's report-computation logic (not a second implementation of
  the same math).
- `sdk.mailer.send()` for the email; `sdk.notifications.send()` for the
  in-app counterpart.

**Dependencies:** L.8.

**Review checklist:** triggering the handler manually in dev produces one
email and one notification, not a duplicate on a second trigger within the
same period; email renders sensibly with SMTP unconfigured (no-op per the
mailer package's own convention, not an error).

---

#### L.12 — Saving jars

**Goal:** Saving-type kinds, jars, and the fund-from-jar expense flow —
completing what L.3/L.5/L.6 deliberately left out.

**Deliverables:**

- Saving-type `ledger_kinds` creation, which also creates the linked
  `ledger_saving_jars` row (one jar per saving kind).
- Contribution/withdrawal actions against a jar
  (`ledger_jar_transactions`), keeping `ledger_saving_jars.balance` in
  sync transactionally.
- Budget screen's Saving section (target + jar balance, per
  `web-shell.md` screen 3).
- L.6's "fund from a saving jar" toggle enabled: selecting a jar swaps the
  category/subcategory fields for a jar picker and writes a
  `ledger_jar_transactions` withdrawal instead of a `ledger_transactions`
  row.

**Dependencies:** L.5, L.6.

**Review checklist:** a jar-funded expense produces exactly one row (jar
withdrawal), never also a `ledger_transactions` row — the exact double-
booking bug this spec's data model section already corrected once at
design time; Reports' actual-net-of-jars figure changes correctly when a
jar-funded expense is logged.

---

#### L.13 — Rule-based insights

**Goal:** Budget-variance tips surfaced on Overview and Reports.

**Deliverables:**

- A small rule set computed at query time (no new table): a category
  running over budget for N consecutive months; a single transaction
  unusually large relative to its kind's typical spend.
- Rendered as plain-language cards, per the wireframes' existing Insights
  sections.

**Dependencies:** L.8 (needs multi-month report data to compute variance
against).

**Review checklist:** rules produce zero false positives against a single
month of seeded data (nothing to compare against yet); a second seeded
month with a deliberately over-budget category produces exactly the
expected tip.
