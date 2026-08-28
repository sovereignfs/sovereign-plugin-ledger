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

✅ **L.2 shipped (0.2.0)** — full Phase 1 schema (all 15 `ledger_*` tables),
migrated on both dialects, plus the FX-rate-as-of-date helper and a dev
seed script.

**A real bug was found and fixed mid-task, before anything was
committed**, while writing the seed script: the original schema draft used
`tenant_id` as if it were the per-user scoping column. It isn't —
`docs/plugin-database.md` and `sovereign-plugin-kanban.local`'s own
`authz.ts` (`Actor { userId, tenantId }`) confirm `tenant_id` is a
platform-required, multi-tenancy-readiness column that's constant in this
v1 single-tenant world; the real per-user field is a separate `user_id`.
The bug wasn't just naming — `ledger_period_reviews`' primary key, as
originally drafted on `(tenant_id, year, month)` alone, would have
collided across every user on the instance, since every user shares the
same constant `tenant_id`. Every table and every "per-user" index got a
`user_id` column and was re-keyed on it before migrations were generated;
see the Data model section's correction #5 for the full account. No
migration with the bug was ever generated or committed.

Verified live against the real dev sqld instance, not just the ephemeral
test DB: restarted `pnpm dev` so it picked up the new migrations, ran
`scripts/seed.ts` against the real `plugin_fs_sovereign_ledger` namespace
(looked up `owner@sovereign.local`'s real id via the already-seeded
platform dev accounts), confirmed all 15 tables and every seeded row via
direct SQL against the sqld HTTP endpoint, confirmed re-running the seed
script is a clean no-op, and confirmed `/ledger` still renders with zero
console errors. `pnpm exec vitest run plugins/sovereign-plugin-ledger.local`
(5 tests: schema sanity + 4 FX-rate-helper cases covering same-currency
short-circuit, no-rate-yet, latest-rate-picked, and all-rates-in-the-future),
typecheck, lint, format:check, and design-tokens-check all pass clean.

✅ **L.3 shipped (0.3.0)** — query modules (`app/_lib/queries.ts`) and server
actions (`app/actions.ts`) for currencies, incomes, Dynamic/Fixed
categories+kinds, and transactions, plus `action-result.ts`/`authz.ts`/
`ids.ts` mirroring `sovereign-plugin-kanban.local`'s exact shapes.

Ownership is enforced directly in every mutation's own `WHERE` clause
(`id = ? AND user_id = ?`), not a separate pre-check — a forged id
belonging to another user simply matches no row and returns a "not found"
`ActionResult`, never a thrown error. No action's input type accepts a
`userId` parameter at all; the owner always comes from `requireUser()`'s
resolved session. `createCategory`/`createKind` reject `type: 'saving'` —
reserved for L.12 — checking the category's real `type` column rather than
just assuming no saving category exists yet.

`app/__tests__/actions.test.ts` (11 tests total, up from L.2's 5): every
mutating action denied against another user's rows in one batch assertion
with a before/after row-count diff proving zero side effects; an
unauthenticated call rejected; both saving-rejection paths (a direct
`createCategory` call, and a kind creation attempt against an
already-existing saving-type category row inserted directly — covering the
case where `createCategory`'s own guard isn't the only thing standing
between the database and a saving-type kind); and two happy-path tests
including `setBaseCurrency` never leaving two currencies flagged as base
at once. All against the real generated migrations on the same ephemeral
libsql DB pattern as L.2, SDK mocked to impersonate switchable users
(`sovereign-plugin-kanban.local`'s own `actions.test.ts` pattern).

Verified live: `/ledger` still renders cleanly with the new `'use server'`
actions module present, no compile or console errors (the actions aren't
wired to any UI yet — that's L.4 onward — so this is a compile/regression
check, not a feature check). Full check suite (vitest, typecheck, lint,
format:check, design-tokens) passes clean.

✅ **L.4 shipped (0.4.0)** — the 4-screen setup wizard (base currency,
primary income, first expense categories with suggested chips + pre-filled
amounts, ready/summary), matching `docs/adhoc/setup-wizard.md` exactly.
One new server action added, `createCategoryWithKind` (atomic
category+kind creation, needed because plain `createCategory`/`createKind`
never echo a created id back to the client for chaining — matches this
app family's own "actions return only `ActionResult`" convention, so a
combined action was the right fix, not a signature change to the existing
ones). Two retroactive fixes bundled in, both cross-cutting gaps rather
than L.4-specific: `app/error.tsx` (a hard platform rule this plugin was
missing since L.1) and a new plugin-local `CategoryChip` toggle component
(a confirmed real Design System Gap — `TagInput` is free-text,
`SegmentedControl` is single-select, `Toggle` is a single switch; none fit
a zero-to-many tappable pill option. Built as a plain `<button
aria-pressed>` + CSS module, matching the same pattern already used for
toggled buttons elsewhere in this app family, e.g.
`sovereign-plugin-docs.local`'s `RichTextEditor` toolbar — not promoted to
`packages/ui` since there's only one consumer so far).

**A real, non-obvious bug found and fixed live, not caught by any static
check:** every wizard-step action calls the shared `refresh()` helper
(`revalidatePath('/ledger', 'layout')`), and Next.js automatically
re-runs the current route's server component once that action resolves.
The original `page.tsx` branched server-side between `<SetupWizard/>` and
a "complete" placeholder based on a fresh DB check on every render — so
the moment step 3's last category was created, the resulting automatic
refresh re-ran that check, found setup now complete, and swapped the
entire tree to the placeholder before the user ever saw the Ready/summary
screen. Caught live (the browser genuinely jumped straight from category
selection to "Setup complete", skipping step 4 entirely), not by
inspection. Fixed architecturally: `page.tsx` now always mounts the same
`SetupWizard` component regardless of status, passing the initial status
as a prop; `SetupWizard` snapshots it once via `useState(initialStatus)`
(whose initializer runs only on mount) and manages every subsequent step
transition — including the final hand-off to the complete view — entirely
in client state, immune to the parent's incidental server refreshes. Only
a genuine full navigation (a real link, a hard reload) re-mounts the
component and re-reads fresh status.

**A second bug from the same root cause, `useActionState`'s dispatch
called directly from a plain `onClick`:** React logged "An async function
with useActionState was called outside of a transition" on every step
1/2 submission — functionally the state still updated, but `isPending`
wasn't guaranteed to track correctly, which the wireframes' own pending/
loading-label requirement depends on. Fixed by wrapping each dispatch
call in `startTransition`, exactly as React's own error message
prescribes.

Verified live end-to-end at every step, in two separate passes (the
second in a brand-new tab with zero prior console history, to rule out
stale message accumulation from the first debugging pass): fresh account
(currency data cleared and restored via direct SQL, not a second
throwaway account, since `pnpm sv seed` currently only reasons about
board/document-style plugins) → step 1 → 2 → 3 (including the "+ Custom"
category flow) → 4 → "Go to Ledger" → complete state, zero console errors
at every transition; refreshing mid-wizard (after step 1 only) resumes at
step 2 with the correct currency, not a restart; a hard reload on the
complete state re-derives correctly with no flash of the wizard. Full
check suite (13 tests, typecheck, lint, format:check, design-tokens) all
pass clean.

✅ **L.5 shipped (0.5.0)** — the `ThreeColumnLayout` web shell
(`LedgerShell`/`LedgerSidebar`), Overview's two states (populated dashboard
and setup checklist), and Budget's list+detail+edit-budget screen, per
`web-shell.md` screens 1–3.

**Sidebar built to match the wireframe's structure exactly, but with real
navigability constraints resolved rather than left as dead links.**
Accounts, Reports, and Settings have no page shipped yet (L.7/L.8, and no
task at all for Settings), so they render as disabled "coming soon" rows —
not `<Link>`s to a 404 — per sv-ui-design's "no dead nav" rule. "+ Add
expense" is a disabled pinned button (native `title` tooltip, no new DS
component needed) until L.6 builds the dialog it opens.

**Overview's checklist-vs-dashboard trigger deliberately deviates from
`web-shell.md`'s own wording.** The wireframe says the checklist collapses
once its "beyond minimum" sections (saving plans, accounts, ...) are filled
in, "or dismissed" — but every one of those sections has no task shipped
yet, so none can ever be filled in during this phase of the build, and this
task doesn't add a persisted dismiss action (not asked for, and building one
now — its own affordance, its own persisted flag — would be scope creep for
a screen this phase of the build couldn't otherwise reach anyway). Used
instead: whether the user has logged at least one expense
(`transactionCount > 0`), which the DB/actions layer has supported since
L.3 even though L.6's dialog doesn't exist yet. Verified both states live by
directly clearing/restoring the four seed transactions via the dev sqld
endpoint (documented in `AGENTS.md`'s dev-environment notes) rather than a
second throwaway account, since `pnpm sv seed` only reasons about
board/document-style plugins.

**Net worth and saving jars are real, currently-zero aggregates, not
placeholders.** `getOverviewData` queries `ledger_accounts`/`ledger_assets`/
`ledger_deposits`/`ledger_loans`/`ledger_saving_jars` directly — genuinely
empty right now (L.7/L.12 haven't shipped, so nothing can insert a row into
any of them), not hand-stubbed. Once those tasks ship, the cards start
showing real data with no change to Overview itself. Insights and the
month-end review `SystemBanner` are omitted outright, not stubbed — they
depend on L.13 and L.8 respectively, and a permanent "coming soon" card for
either would be clutter for features 3–8 tasks away. The wireframe's Recent
Activity also draws an illustrative income row ("Salary — Primary income,
+€2,400") that has no basis in this data model — an income is a declared
recurring amount, never a logged event — so every row rendered here is a
real spend, no income rows at all.

**A genuine architectural question resolved by testing, not just reasoning:
does `revalidatePath('/ledger', 'layout')` (every action's shared
`refresh()` helper) reach `/ledger/budget`, a sibling route with no shared
`layout.tsx` between them?** `EditBudgetDialog` (the "Edit budgeted amount"
flow, wired to the existing `updateKindBudget` action from L.3) doesn't rely
on the answer — it calls `router.refresh()` client-side after a successful
save, which forces `/ledger/budget`'s own server data to refetch
unconditionally regardless of `revalidatePath`'s exact scoping. Safe here in
a way L.4's `revalidatePath`-triggered bug wasn't: `BudgetView` holds `data`
as a plain prop, not frozen into local state, so a fresh server render just
flows new props into the already-mounted client tree — confirmed live that
`selectedCategoryId` survives the refresh with no flicker or reset.

**`page.tsx` goes back to branching directly between `SetupWizard` and the
real Overview** on a single fresh status read, reverting the "always mount
the same component" indirection L.4 added. That indirection existed only to
protect an *in-progress* multi-step client interaction (the wizard) from
being swapped out by an incidental mid-flow refresh — it was never a
general rule against branching in a server component. Overview as built in
L.5 triggers no mutations of its own, so there's no path by which a refresh
could fire while a user is mid-interaction with it; the branch is a single,
one-time decision on first render, not a swap out from under existing
client state. Documented in `page.tsx`'s own comment, including a flag for
whoever adds L.6's Add-expense dialog directly to Overview to re-check this
reasoning still holds. `SetupWizard` itself simplified alongside this — its
own now-unneeded `showComplete` placeholder branch is gone; "Go to Ledger"
does a hard `window.location.href` reload instead, guaranteeing a fully
fresh server render with zero dependency on Next's router-cache behavior
for what is a rare, one-time transition.

**Every category created through any shipped flow has exactly one kind**
(`createCategoryWithKind`, the wizard's only path) — so "Edit budgeted
amount" in the detail column unambiguously edits `category.kinds[0]`.
`createKind` could in principle add a second kind to an existing category
with a different currency, but nothing calls it outside the wizard's own
combo action yet; documented in `CategoryDetail.tsx` and `budget.ts` as an
assumption to revisit if a later task adds that flow, not silently baked
in. Budget's category/kind list is fully preloaded in one round trip
(including each category's recent transactions) rather than "fetched on
selection" as this doc's Data fetching contract originally described —
written before this task's actual dataset size (a handful of categories per
user) was known; preloading is simpler and just as fast at this scale, a
deliberate deviation, not a miss.

Verified live end-to-end: populated dashboard (real seed data — income,
spend, projected-saved, budget-progress bars, recent activity, zero net
worth/jars) and the setup checklist (seed transactions temporarily cleared
via direct SQL against the dev sqld endpoint, then restored to their exact
original values afterward) both render correctly with zero console errors;
Budget's list promotes the detail column on category selection and
collapses back on deselection; the edit-budget dialog updates both the list
row and detail column immediately, preserving the current selection;
manually pushing "Eating out" under its actual spend confirmed the
error-token "over" state (progress bar clamped, red amount text) on both
the list row and detail column, then restored to its original budget. 29
tests across 7 files (13 pre-existing + 16 new: period/money helpers,
`getOverviewData`, `getBudgetData`), typecheck, lint, format:check, and
design-tokens-check all pass clean.

✅ **L.6 shipped (0.6.0)** — the Add-expense overlay (`AddExpenseDialog`,
`Dialog size="md"`), wired to the sidebar's "+ Add expense" button, which
is no longer disabled. Amount (`CurrencyInput`, currency shown read-only
in the field's own label — see below), category/subcategory `Select`
pickers (subcategory resets to the new category's first kind whenever
category changes), `DatePicker` (defaults to today), a disabled "Fund from
a saving jar" `Toggle` with the wireframe's exact helper copy, and an
optional note. Submits through L.3's existing `createTransaction` — no new
mutation needed.

**A new read-only server action, `getExpenseFormOptions`** — the first
non-mutating action in this file. Needed because "+ Add expense" lives in
`LedgerSidebar`, shared shell chrome rendered identically from every page
(Overview, Budget, and eventually Accounts/Reports/Settings), not a single
page's own server component with a natural place to preload this into.
Fetched lazily, only when the dialog actually opens, so a page that never
opens it never pays for the query — deliberately different from Budget's
own "preload everything up front" choice in L.5, because that dataset was
scoped to one page's own render, and this one has to be reachable from
every page under the shell without every one of them independently
fetching and threading category data down through `LedgerShell` just for
a dialog they may never open.

**The wireframe's inline "EUR ▾" currency picker inside the amount field
was deliberately not built.** `CurrencyInput` has no currency prop by
design (confirmed against the real component before assuming otherwise),
and every kind's currency is still fixed at creation time — letting a user
pick a different currency here would just produce an amount that disagrees
with the subcategory's own budget currency, a foot-gun with no upside
given nothing today can create a kind in a currency other than the base
one anyway. The selected subcategory's currency is shown read-only in the
Amount field's own label instead (`Amount (EUR)`), the same pattern
`IncomeStep`/`EditBudgetDialog` already use.

**A real correction to this task's own review checklist, caught before any
code was written wrong:** the checklist called for `useCommitOnEnterOrBlur`
on the amount/note fields, but CLAUDE.md's own hard rule for that hook
carves out precisely this shape — a field inside a form with its own
always-visible submit button should NOT commit on blur. This dialog has
exactly that ("Add expense"), so amount/note are plain controlled fields,
submitted together on button click; using the hook here would have fought
the form's own submit flow for no reason. Checklist wording corrected
above rather than silently ignored.

Verified live end-to-end, including both directions of `router.refresh()`
established in L.5: submitting from Overview's checklist state (zero
transactions) correctly flips it straight to the populated dashboard in
the same render, with no intermediate flash; submitting from the Budget
page updates that category's own row and progress bar in place, preserving
whatever else was on screen; category selection correctly resets
subcategory to the new category's own kind; the disabled jar toggle and
its helper text render exactly per the wireframe. All three submissions
used during verification were removed afterward via direct SQL against the
dev sqld endpoint, restoring the four original seed transactions to their
exact original values — confirmed via a final reload showing the original
€125.90 spent and the original Recent Activity list. 3 new tests
(unauthenticated rejection, cross-user isolation, and shape) for
`getExpenseFormOptions` on top of the existing 29. Full check suite
(32 tests, typecheck, lint, format:check, design-tokens) all pass clean.

✅ **L.7 shipped (0.7.0)** — the unified net-worth screen (`AccountsView`/
`AccountsMain`/`AccountsDetail`) per `web-shell.md` screen 4: banking,
credit cards, assets, deposits, loans, and people, each with a create
dialog, list+detail promotion, and delete (`ConfirmDialog`); loans also
get a full edit flow. `getNetWorthMinor` (`app/_lib/accounts.ts`) is now
the single, shared net-worth calculation — Overview's own summary card
was quietly duplicating this exact math since L.5 and now calls the same
function instead of maintaining a second copy.

**Loans reuse one shared "Loans" fixed category across every loan a user
has, rather than one dedicated category per loan** — a design refinement
made before writing any code, not the plan this doc originally sketched.
Each loan gets its own kind (subcategory) under that shared category
(`LOANS_CATEGORY_NAME`, found-or-created on the first loan), matching how
every other multi-item Fixed grouping already renders on the Budget page:
one "Loans" row, expandable to each loan's own installment. Editing a
loan's name or installment keeps its linked kind in sync
(`updateLoan`); deleting a loan removes the loan row and its own kind
(never the shared category, which is a documented, minor cosmetic gap if
every loan is later removed — see the fix below for why that gap turned
out not to be purely cosmetic).

**"Record a payment" from the wireframe was deliberately not built as a
separate action.** A loan's installment is a normal Fixed budget kind
under "Loans" — the user logs it through L.6's existing Add-expense
dialog exactly like any other fixed expense, rather than this task
inventing a second, parallel payment-recording mutation that would need
its own decision about whether/how it touches `remainingBalanceMinor`.
`remainingBalanceMinor` itself is a plain editable field via "Edit loan" —
manually updated, not auto-derived from logged payments. Neither
deliverable text nor the review checklist required "Record a payment" as
its own action, so this is a scope decision, not a miss.

**A real crash found live, not by inspection:** deleting a loan (via the
brand-new delete flow above) leaves its shared "Loans" category behind
with zero kinds if it was the last one — and the very first thing that
category touched, `formatMoney`'s `Intl.NumberFormat`, threw `RangeError:
Invalid currency code` on the empty-string fallback `kinds[0]?.currency ??
''` in `getBudgetData`, taking down the entire Budget route via its error
boundary. Reproduced by literally deleting the loan just created during
this task's own live verification, then navigating to Budget. Fixed by
having both `getBudgetData` and `getOverviewData`'s `topCategories` skip
any category with zero kinds outright — there's nothing meaningful to
show for one, and it also resolves the "orphaned empty row" cosmetic
concern this doc had originally accepted as unavoidable. Two regression
tests added (`budget.test.ts`, `overview.test.ts`) seeding exactly this
empty-category shape.

**A second real bug found live, in the loan create/edit date fields:**
picking "Oct 15" in `CreateLoanDialog`'s `DatePicker` round-tripped to
"Oct 14" the moment `EditLoanDialog` re-displayed it. Root cause:
`toDateOnly` converted the picked `Date` (local midnight) through
`.toISOString().slice(0, 10)`, which reads the UTC calendar date — in any
timezone ahead of UTC (reproduced in Europe/Berlin, UTC+2), local midnight
is still the previous day in UTC, silently shifting the stored date back
by one. `EditLoanDialog`'s own `new Date(\`${loan.endDate}T00:00:00Z\`)`
parse had the identical bug in the opposite direction for timezones
behind UTC. Fixed with a proper local-calendar-only pair,
`toDateOnly`/`fromDateOnly` (`app/_lib/format.ts`), replacing every ad hoc
`.toISOString()`/`T00:00:00Z` conversion in `CreateLoanDialog`,
`EditLoanDialog`, and `AccountsDetail`'s month/year display — a
date-only field must never round-trip through a UTC instant.

**Only loans get a wired-up edit dialog.** `updateAccount`/`updateAsset`/
`updateDeposit` exist in the actions layer (for consistency with every
other entity type's CRUD shape) but have no edit UI in this task — a
deliberate scope cut matching the wireframe, which only draws "Edit loan"
as an explicit affordance; every other entity type is view + delete only
for now.

**Overview's checklist rows for accounts/credit cards/assets/deposits/
loans/people are now real, not permanently "coming soon."** Each reflects
whether the user has at least one row of that type (done, with a count)
or links into `/ledger/accounts` (pending, no longer disabled) — only
Saving plans stays disabled pending L.12. This is the direct payoff of
`/ledger/accounts` now existing; the L.5-era placeholder rows are gone.

Verified live end-to-end: created a bank account and confirmed net worth
updated correctly; created a loan and confirmed its linked "Loans" fixed
expense appeared on the Budget page with the right budgeted amount; the
loan detail view's paid-off percentage and progress bar computed
correctly; edited the loan and confirmed the linked kind's name/budget
stayed in sync; deleted the loan and confirmed both the crash (before the
fix) and the correct empty state (after) on Budget/Overview; created a
person, recorded a signed transaction, and confirmed `BalanceChip`
rendered "Owed EUR 18.00" correctly; deleted the person and confirmed
their transaction history was gone too. All test data (accounts, the
loan, the person, the empty "Loans" category) removed afterward via
direct SQL against the dev sqld endpoint, restoring the four original
seed transactions and zero-accounts baseline. 17 new tests (14 action
tests + 3 query-module tests) on top of the existing 29, for 46 total.
Full check suite (typecheck, lint, format:check, design-tokens) all pass
clean.

✅ **L.8 shipped (0.8.0)** — period list + detail (`ReportsView`/
`ReportsMain`/`ReportsDetail`) per `web-shell.md` screen 5: every month
with any transaction activity, most recent first, each with a
`StatusBadge` ("Needs review"/"Reviewed") sourced from
`ledger_period_reviews`; the selected period's detail shows the three
savings figures, a top-categories breakdown with budget-variance labels,
"Mark as reviewed," and "Adjust budget" (navigates to `/ledger/budget`,
no duplicate editor). Month-end review has no sidebar item of its own,
matching the wireframe's explicit direction — it's a status folded into
the period itself.

**The three savings figures, worked out precisely rather than guessed
from the wireframe's numbers alone:** *Projected savings* = income minus
the sum of every kind's budgeted amount. *Actual savings* = income minus
actual spend (`ledger_transactions`) this period. *Actual, net of jars* =
actual savings further adjusted for jar withdrawals only — a
jar-contribution has no effect on this figure (moving cash into a jar
doesn't change total household savings, only where it sits), while a
jar-withdrawal-funded expense reduces it, since that spending is real but
never appears in `ledger_transactions` at all (SPEC.md's Data model
correction #3). Verified this derivation against the wireframe's own
numbers (Actual 980 → net-of-jars 720, a 260 gap, consistent with a 260
withdrawal that period) before writing any code, not after. Always equal
to `actualSavingsMinor` today, since no `ledger_jar_transactions` row can
exist before L.12 ships saving jars — inert, not hardcoded to zero.

**A known, explicitly-documented simplification, not a silent gap:**
income and budgeted amounts have no history (same shape as
`predictedAmountMinor`'s already-documented non-effective-dating
limitation from L.2) — every period's "income" and "projected savings"
reflect the user's *current* declared income and budget, not what was
actually true in that historical month. A real limitation for anyone
whose income or budget has changed over time; not solved here, same as
the schema's own original call.

Two smaller, deliberate scope decisions: Insights (the wireframe's
"Eating out has run over budget 3 months running..." card) is omitted
outright rather than stubbed, same as L.5 — it depends on L.13, which
doesn't exist yet. And there's no gate on which periods are
review-eligible — the current, still-in-progress month appears in the
list like any other and can be marked reviewed early if a user wants to;
nothing in the schema or data model naturally distinguishes "this month
is done" from "still accumulating," so adding one would have been
speculative.

`markPeriodReviewed` uses `onConflictDoNothing` targeting the
`(userId, year, month)` primary key — the review checklist's explicit
idempotency requirement, verified live: clicking "Mark as reviewed" twice
never throws and never duplicates a row (confirmed directly against the
dev sqld endpoint: exactly one row after two clicks).

Verified live end-to-end against real seeded dev data: Projected savings
€2,170.00 (€4,200 income − €2,030 total budgeted), Actual savings
€4,074.10 (€4,200 − €125.90 spent), Actual net of jars identical (no jars
exist), and each top category's variance label computed correctly
(Groceries -28%, Transport -63%, Eating out -95% vs. budget) — all
independently checked against the seed data's real numbers before
trusting the screen. "Mark as reviewed" flips the `StatusBadge` to
"Reviewed" immediately and persists across a fresh reload; "Adjust
budget" navigates cleanly to `/ledger/budget`. Test data removed
afterward via direct SQL, restoring the zero-reviews baseline. 9 new
tests (5 for `getReportsData`'s savings-figure/variance-label math, 4 for
`markPeriodReviewed`'s idempotency and cross-user isolation) on top of
the existing 46, for 55 total. Full check suite (typecheck, lint,
format:check, design-tokens) all pass clean.

This closes out Phase C (Net worth & reporting) — L.5 through L.8 are
all now shipped, covering the full web core budget loop end to end.

✅ **L.9 shipped (0.9.0)** — the `ResponsiveSurface` mobile tree per
`mobile-fork.md`: a self-rendered `MobileFooter` (`Overview`/`Budget`
left, `Accounts`/`Reports` right, platform's own center Apps launcher),
an Apps drawer sourced from `sdk.plugins.list()`, a floating "+ Add
expense" FAB, and all four sections — Overview, Budget, Accounts,
Reports — reshaped for mobile with drill-down navigation.

**One deliberate deviation from this task's own original deliverable
text, decided independently and then strongly validated by a precedent
found mid-task:** the plan called for
`shellConfig: { mobileHeader: false, mobileFooter: false }` — a fully
self-rendered header too, for a per-screen title. Only `mobileFooter:
false` shipped; the platform's real `MobileHeader` (with a working
notification bell and account menu) stays. `MobileHeader`'s API has no
slot for a plugin-controlled title beyond replacing the whole component,
and `NotificationBell`/`AccountMenu` live in `runtime/src`, not
`@sovereignfs/ui` — confirmed directly against the package's own
exports — so self-rendering the header means rebuilding a full
notification center and account menu from SDK primitives from scratch,
exactly what `sovereign-plugin-kanban.local`'s `shell: minimal` build
had to do. That's a real, substantial side-build for a "per-screen
title" benefit plain in-content headings (`<h1>` on each mobile screen)
deliver at negligible cost. Discovered only after making this call that
`sovereign-plugin-tally.local` — the same `shell: default` situation —
had already made and documented the identical trade-off, almost
word-for-word, in its own `TallyMobileShell.tsx` doc comment. Not a
coincidence worth ignoring: this is now the second `shell: default`
plugin to independently reach the same conclusion, worth treating as the
default answer for any future one.

**Two real bugs found and fixed before anything shipped, both self-caught
via live verification, not reported:**

- **Broken plugin icons in the Apps drawer.** The first `app/_lib/apps.ts`
  mapped `iconUrl: app.icon` straight from `sdk.plugins.list()` and
  rendered it as an `<img src>` — broken images, since
  `PluginAvailability.icon` is each plugin's raw `manifest.icon` value
  (e.g. `"icon.svg"`, relative to that plugin's own directory), never a
  servable URL on its own. Root-caused via `runtime/src/sdk-host.ts`'s
  `toPluginAvailability()`; the real served path is always
  `/plugin-icons/<id>.svg` (`runtime/app/api/plugins/sidebar/route.ts`'s
  own convention). Fixed by carrying `hasIcon: boolean` instead and
  constructing the URL at render time — which, once found, turned out to
  exactly match Tally's own `TallyMobileShell.tsx` implementation.
- **Over-built Apps drawer, corrected before it caused a bug.** The first
  draft added a synthetic "Home" tile and excluded the Launcher plugin
  from the list, mirroring Kanban's `shell: minimal` pattern, and used
  `onClick` + manual `router.push` for every drawer item. Tally's
  `shell: default` precedent does neither — no Home tile, no Launcher
  exclusion (the real platform header's brand badge already provides a
  way home), plain `href` navigation (a full page load, correct for
  crossing plugin boundaries). Rewritten to match Tally's simpler,
  more-applicable-to-this-shell-type approach exactly.

**Drill-down reuses each section's existing desktop selection state
directly** (`BudgetView`/`AccountsView`/`ReportsView`'s own
`selectedId`/`selected` `useState`, already driving the desktop detail
column) rather than a separate mobile-only `step`-state stack as the
task text sketched — `ResponsiveSurface` forks only the *presentation*.
The mobile detail screens (`MobileBudgetScreen`/`MobileAccountsScreen`/
`MobileReportsScreen`) reuse `CategoryDetail`/`AccountsDetail`/
`ReportsDetail` verbatim behind a hand-rolled `‹ Label` back header (no
shared DS component for this shape exists yet) — one source of truth for
detail content instead of a second, mobile-specific copy, and
guaranteed feature parity with desktop for free (including
`ReportsDetail`'s own "Adjust budget →" button, which needed no mobile-
specific handling at all — a plain `router.push('/ledger/budget')`
lands on the same footer destination either way).

**`AddExpenseDialog` forks `Dialog`↔`Drawer` via `useIsMobile`** — Drawer
specifically for Add-expense, matching the explicit wireframe direction
("Drawer, not Sheet") for the single most frequent action in the app.
The other seven create/edit dialogs (`CreateAccountDialog`,
`CreateAssetDialog`, `CreateDepositDialog`, `CreateLoanDialog`,
`CreatePersonDialog`, `EditLoanDialog`, `EditBudgetDialog`,
`RecordPersonTransactionDialog`) deliberately stay `Dialog`-only —
`Dialog` already renders as a full-screen sheet on mobile on its own
(`packages/ui`'s own doc comment), confirmed looking correct live, so
forking each of them to `Drawer` too would have been unrequested scope
with no UX gain.

A real-looking bug investigated and ruled out before writing any fix:
`MobileFooter`'s `z-index: 101` sits *above* `Dialog`/`Drawer`'s scrim
`z-index: 100`, which looked like the footer would bleed through an open
dialog. It doesn't — both `Dialog` and `Drawer`'s mobile scrim already
stop their `bottom` edge at `var(--sv-shell-footer-height)` (published by
`MobileFooter` itself), so the two never geometrically overlap and the
z-index values never actually compete. Confirmed via live computed-style
inspection (`scrimBottom` exactly matching the footer's measured height)
before concluding this, not by reasoning alone.

Verified live end-to-end at 375px width, not just via the check suite:
all four mobile screens render correctly; Budget and Accounts drill-down
confirmed (a real "Test Mobile Account" created via the mobile
full-screen `CreateAccountDialog`, drilled into, deleted, cleanly back to
the empty state); Reports opens straight into the latest period's detail
(matching desktop's own "default to most recent" behavior) with working
back navigation; the FAB opens `AddExpenseDialog` as a `Drawer` with the
footer correctly still visible beneath it (`Drawer`'s own documented
design); the Apps drawer shows correct fallback icons for every other
installed plugin with Ledger itself excluded; footer active-state
(`.navItemActive`) tracks the current route correctly across all four
sections; zero console errors throughout. Desktop's `ThreeColumnLayout`
re-verified unaffected (Budget list + detail still renders and selects
correctly at 1280px). Full check suite — typecheck, lint, format:check,
`design:tokens:check`, and all 55 existing tests (L.9 added no new
query/action logic, only UI, so no new tests) — passes clean.

This closes out the mobile-fork phase.

✅ **L.10 shipped (0.10.0)** — the daily exchange-rate fetch,
`app/_jobs/fetch-fx-rates.ts`, a manifest `schedules` entry
(`intervalMinutes: 1440`) against `ledger_fx_rates`.

**Pivot is USD, not EUR**, despite Frankfurter's own ECB data being
natively EUR-denominated — CONCEPT.md's design has fiat and crypto rates
sharing one table under one pivot, and a crypto source would default to
USD pricing (every major crypto API does), so USD is the pivot both kinds
of source can share without a second conversion hop between them. One
batched `base=USD&symbols=...` call returns "value of 1 USD in X" for
every currency; the job inverts each (`1 / rate`) to store "value of 1 X
in USD," matching `getRateAsOf`/`sumConvertedToBase`'s existing contract.

**Fiat only, no crypto fetch, despite CONCEPT.md's "fiat and crypto
alike" framing — a scope cut made explicit, not a silent gap.** No crypto
currency is selectable anywhere in the app: `CURRENCY_OPTIONS` (extracted
from `SetupWizard.tsx` into its own `app/_lib/currency-options.ts` this
task, since the fetch job needed it too — six other create/edit dialogs
already imported it from `SetupWizard.tsx`, all repointed) is a fixed set
of 20 fiat codes, nothing else. Building a crypto fetch branch now would
be dead code with no real currency to exercise it; the schema already
accommodates one later (`source` is a free-text provenance column, not an
enum). Revisit only once some later task actually adds a crypto currency
option to the UI.

**Two of the 20 `CURRENCY_OPTIONS` codes aren't in Frankfurter's coverage
at all.** Confirmed directly against its own `/v1/currencies` endpoint
before writing any code, not assumed: LKR and AED are both absent. The job
silently skips a code Frankfurter doesn't return a rate for — a user on
one of these two currencies degrades to "no conversion available" via
`getRateAsOf`'s own existing contract, exactly like a brand-new currency
this job hasn't run for yet. Live-verified: exactly 17 rows land per run
(19 non-pivot codes minus LKR/AED), never 19.

**`as_of_date` is Frankfurter's own returned `date`, not this server's
local "today"** — its ECB-sourced rates lag by a day on the API's own
publishing schedule (confirmed live: a job run on 2026-08-28 stored
`as_of_date: '2026-08-27'`, Frankfurter's actual reference date), and
storing that real reference date rather than the request date is what
keeps `getRateAsOf`'s "most recent rate on or before this date" lookup
correct.

**Idempotency required a real schema change**, not just
`onConflictDoNothing`: `ledger_fx_rates`'s existing lookup index
(`(currency_code, pivot_code, as_of_date)`, from L.2) was a plain index,
not unique — re-running the job would have inserted duplicate rows
outright, silently corrupting `getRateAsOf`'s "most recent" ordering once
duplicates existed. Migrated to `uniqueIndex` on both dialects (SQLite
`0001_careful_cammi.sql`, Postgres `0001_shallow_marauders.sql` — each a
two-line `DROP INDEX` + `CREATE UNIQUE INDEX`, no data migration needed
since the table was still empty in every real environment).

Verified live end-to-end against the real dev database, not just the
7 new mocked-SDK unit tests (62 total): restarted the real dev server
twice independently (the scheduler's `lastRun` state is in-memory, so a
process restart re-arms every schedule and its very first tick fires
within ~60s regardless of `intervalMinutes` — no need to temporarily
shrink the interval to force a fast tick) and queried the dev sqld
`ledger_fx_rates` table directly after each. First run: 17 rows with
real, plausible market rates (EUR ≈ 1.1645 USD, GBP ≈ 1.3582 USD,
JPY ≈ 0.00627 USD). Second run, a fully independent process restart:
still exactly 17 rows, not 34 — confirming the unique-index +
`onConflictDoNothing` idempotency mechanism holds through the *real*
scheduler → `runWithBackgroundPlugin` → `sdk.db.getClient()` path, not
only the mocked-SDK unit tests (which can't exercise that plugin-identity
resolution at all, and where exactly this class of bug has previously
shipped — see the root `CLAUDE.md`'s `0.94.3 → 0.94.4` entry). Full
check suite — typecheck, lint, format:check, `design:tokens:check`, and
all 62 tests — passes clean.

✅ **L.11 shipped (0.11.0)** — the 1st-of-month recap,
`app/_jobs/month-end-report.ts`, a second `schedules` entry on the same
plugin (`intervalMinutes: 1440`), gated internally by a new
`isFirstOfMonthUtc()`/`getPreviousYearMonth()` pair in `period.ts` since
the scheduler only offers a fixed interval, never a day-of-month trigger.

**`sdk.email.sendToUser()`, not `sdk.mailer.send()` — this task's own
original deliverable text named the wrong one**, caught before writing any
code: `sdk.mailer.send()` is the raw-recipient-address escape hatch,
additionally requiring `mailer:sendExternal`; `sdk.email.sendToUser()` is
"the recommended default" for a known `userId` per its own doc comment,
needs only the `mailer:send` permission this manifest already declares
(front-loaded since L.1), and no-ops to `{status: 'skipped'}` rather than
throwing when SMTP is unconfigured — satisfying the review checklist's
"renders sensibly... not an error" requirement via the SDK itself, no
special-casing needed here.

**A new table, `ledger_month_end_notifications`, not a column on
`ledger_period_reviews`** — that table's own documented invariant
("absence of a row = needs review") would break if a row could also exist
for a period that was auto-notified but never user-reviewed. Same PK
shape as `periodReviews` (`(user_id, year, month)`), migrated on both
dialects.

**The insert into that table is the idempotency claim, attempted before
sending** (`onConflictDoNothing` + `.returning()` to detect whether *this*
invocation won), not an after-the-fact record: the schedule docs' own
guidance is "claim work... before acting on it, and only act when the
claim succeeded" — necessary because a multi-replica deployment ticks
independently per replica (same reasoning as L.10's unique index, just for
one row per user instead of one row per currency). One real consequence,
tested and documented rather than silently accepted: a user's claim is
consumed even if the email/notification send that follows then throws —
this scheduler generation has no retries at all, so a genuine send failure
means no recap for that user until next month. Not solved here, same class
of known Phase-1 limitation as L.10's own no-retry gap.

**Reuses `getReportsData` verbatim** (no second report-math
implementation, per the task's own explicit requirement) — for each
candidate user (every `user_id` with an `is_base` currency row), pulls
last calendar month's `PeriodReport` out of the same computation Reports'
own screen already uses, and skips the user entirely (no claim attempted)
when there's nothing there (no last-month transactions) rather than
sending an empty recap.

**A per-user `try`/`catch` isolates one user's failure from every other
user's** — unlike `fetch-fx-rates.ts`, where one failed batched call fails
the whole run safely (nothing was written either way), this job fans out
real per-user side effects; an uncaught throw from user #3's email call
would otherwise abort the loop and silently skip every remaining user's
recap for the entire month.

10 new tests (3 for the two new `period.ts` helpers, 7 for the job
covering: the not-the-1st no-op, a real send, the no-last-month-activity
skip, same-period double-invocation staying at one send, SMTP-unconfigured
still notifying and still claiming, one user's failure not blocking
another's, and the claim-before-send trade-off itself), for 72 total.
Verified live beyond the unit suite: the manifest's second `schedules`
entry composes correctly alongside L.10's into
`runtime/generated/plugin-schedules.ts`; a real dev-server restart (the
same real scheduler → `runWithBackgroundPlugin` → `sdk.db.getClient()`
path L.10 already proved works for this plugin) boots clean with zero
errors and, on today's real (non-1st) date, correctly leaves
`ledger_month_end_notifications` at zero rows — confirmed directly against
the dev database. Exercising the real send path live end-to-end (a real
`sdk.email.sendToUser()`/`sdk.notifications.send()` call against the
running platform, not mocked) isn't practical without either a real month
boundary or a temporary code change to force one, and wasn't attempted for
that reason; the review checklist's own "triggering the handler manually
in dev" phrasing is satisfied by the direct-call unit tests above, which
exercise every branch deterministically via the exported
`runMonthEndReport(headers, now)` — the same optional-`now`-parameter
pattern every other time-dependent helper in `period.ts` already uses, not
a test-only hook. Full check suite — typecheck, lint, format:check,
`design:tokens:check`, and all 72 tests — passes clean.

This closes out Phase E (Automation) — L.10 and L.11 are both now shipped.

✅ **L.12 shipped (0.12.0)** — saving-type kinds, jars, and the
fund-from-jar expense flow, completing what L.3/L.5/L.6 deliberately left
out. No new tables: `ledger_saving_jars`/`ledger_jar_transactions` have
existed since L.2, unused until now.

**`createCategoryWithKind`'s `type` union widened to include `'saving'`**
— when saving, it also inserts the linked `ledger_saving_jars` row
(balance zero) in the same transaction as the category+kind. The
lower-level `createCategory`/`createKind` primitives deliberately still
reject `'saving'`, unchanged — only the combined transaction may produce
one, since a saving category with no jar would be an orphaned, broken
state `getBudgetData`'s own jar lookup has to skip defensively.

**A new `createJarTransaction` action** — signed amount (positive =
contribution, negative = withdrawal), same shape as
`createPeopleTransaction`'s established pattern, atomically updating
`ledger_saving_jars.balanceMinor`. One real difference from a person's
balance: a jar can't go negative — the whole point of envelope-style
budgeting — so a withdrawal larger than the current balance is rejected
outright rather than letting the jar overdraw. Live-verified: withdrawing
€500 against an €150 balance was rejected with "This jar doesn't have
enough balance for that withdrawal," balance untouched.

**Budget gained a Saving section** (list rows show target + jar balance
instead of a budget bar, per `web-shell.md` screen 3) on both desktop
(`BudgetMain`) and mobile (`MobileBudgetScreen`), each with their own "+"
entry point opening `CreateSavingJarDialog` — the one new creation flow
this task actually needs. Dynamic/Fixed categories still have no
equivalent "add" UI anywhere in the app (a pre-existing gap predating this
task, not fixed here — mirrored deliberately, not an oversight). Selection
routes to a new `SavingJarDetail` component (target, balance, recent
jar-transaction history, an "Add money / withdraw" action opening
`JarTransactionDialog`) rather than branching inside `CategoryDetail`,
whose prop type doesn't fit a saving category's shape at all.

**`JarTransactionDialog` resolves `web-shell.md`'s own explicitly-flagged
open question** — "the fund-from-a-saving-jar toggle's second state isn't
wireframed yet." Contribution and withdrawal share one dialog (a
`SegmentedControl` picking direction, matching `CreateAccountDialog`'s
bank/credit-card precedent) rather than two separate ones, since the form
is otherwise identical. `AddExpenseDialog`'s own toggle, previously
hard-disabled with a "coming in L.12" hint, now genuinely swaps
Category+Subcategory for a single "Saving jar" `Select` when turned on —
matching the wireframe's literal "a single jar picker" wording, not a
second spend-category on top of the jar — and submits via
`createJarTransaction` (a withdrawal) instead of `createTransaction`,
never both: the exact double-booking this app's data model was corrected
once already at design time (SPEC.md's Data model correction #3). The
toggle disables itself with a "No saving jars yet" hint when the user has
none, rather than allowing it on with nothing to pick.

**A deliberate scope cut, stated explicitly rather than silently
dropped**: CONCEPT.md's "Saving Jar contributions post automatically from
the linked saving plan each period" is *not* built here — L.12's own
Deliverables text never mentions automatic posting, only manual
contribution/withdrawal actions, and automating it would need its own
scheduled job (the same `schedules` shape as L.10/L.11), a separate,
not-yet-scoped task. Revisit only if a later task explicitly picks this
up.

Verified live end-to-end against the real dev database, not just the 9
new tests (81 total): created a real "Travel jar" (€100 monthly target),
contributed €150 (balance → €150.00), withdrew €40 (→ €110.00), confirmed
a €500 withdrawal attempt was rejected with balance unchanged, then logged
a €25 expense funded from the jar via `AddExpenseDialog`'s toggle
(balance → €85.00) and confirmed **Groceries' own actual spend stayed at
exactly €108.00 — no double-booking**. Reports' three figures then read
Actual €4,074.10 (unchanged — the jar withdrawal was never a
`ledger_transactions` row) and Actual-net-of-jars €4,009.10, exactly
€4,074.10 − €65.00 (the two real withdrawals, €40 + €25 — the €150
contribution correctly excluded from this figure per its own documented
contract). Repeated the full create → contribute → withdraw → fund-an-
expense flow at 375px width: the Saving section, `SavingJarDetail`
drill-down, and `AddExpenseDialog`'s jar picker all render and behave
identically on mobile, including the jar-contribution dialog's own
correct full-screen-sheet adaptation (`Dialog`'s existing mobile
behavior, not a new fork). Cleaned up afterward via direct SQL against
the dev database (no in-app delete-jar path exists, matching the
Dynamic/Fixed gap noted above) — confirmed back to the original empty
Saving-section state with every other section's figures untouched. Full
check suite — typecheck, lint, format:check, `design:tokens:check`, and
all 81 tests — passes clean.

✅ **L.13 shipped (0.13.0)** — rule-based budget-variance tips, the last
task in Phase F. No new table: both rules compute at query time from data
`getReportsData` (L.8) and `listTransactions`/`listCategoriesWithKinds`
(L.3) already expose, in a new `app/_lib/insights.ts`.

**Rule 1 — a category over budget for consecutive months.** Walks
`getReportsData`'s own `periods` (most-recent-first) per category,
counting a streak of `actualMinor > predictedMinor` starting from the most
recent period; breaks on the first non-over-budget or missing period.
Reuses `topCategories`' own comparison rather than re-deriving it — a
second, divergent implementation of the same budget-variance math was the
one thing worth avoiding here.

**Rule 2 — a single transaction unusually large for its kind.** Groups all
of a user's transactions by `kindId`, compares the single most recent one
against the average of every earlier one for that same kind, and flags it
once it's at least 2x that average. Requires at least 3 prior transactions
as a baseline (below that, "typical spend" isn't meaningful yet) —
satisfies the review checklist's own "zero false positives... nothing to
compare against yet" requirement. Deliberately scoped to "the latest
transaction only," not every historically-anomalous one, so a one-off
spike from months ago doesn't sit in this list forever.

**Threshold reconciliation, stated explicitly rather than silently
picked**: the over-budget streak fires at **2** consecutive months, not
the 3 in `web-shell.md`'s own Reports wireframe example ("Eating out has
run over budget 3 months running"). CONCEPT.md's own wording is just
"multiple consecutive months" with no fixed number, and 2 is both the
smallest value "multiple" can mean and the only threshold the L.13 review
checklist's own test scenario can reach (a second seeded over-budget month
producing "exactly the expected tip" is unreachable with a 3-month
threshold from two periods). The rendered copy always states the real
computed streak length rather than hardcoding "2" or "3" — a genuine
3-month streak reproduces the wireframe's exact wording without
contradicting the checklist's 2-period testability requirement, verified
directly in `insights.test.ts`.

**`web-shell.md`'s Overview wireframe shows a third, different illustrative
insight** ("Eating out is running about 15% above your 3-month average
this month") that matches neither of SPEC.md's two defined rules. Treated
as out of scope — SPEC.md's own Deliverables text names exactly two rules,
and the wireframe's example reads as illustrative copy from the earlier
wireframing pass, not a third requirement.

**No display cap anywhere insights render, except mobile Overview's
explicit "1 insight"** (`mobile-fork.md`'s own stated cap) — desktop
Overview, and both desktop and mobile Reports, render the full list.
Every wireframe mockup happens to show only one card, but nothing in
CONCEPT.md or this task's deliverables asks for a hard "show at most N"
elsewhere; an arbitrary ranking/truncation policy nobody asked for would
be worse to reason about and test than just rendering everything.

**A found-and-fixed regression from L.12, not part of this task's own
scope**: `overview.ts`'s checklist hardcoded the `saving-plans` row as
permanently `comingSoon: true`/`done: false`, even though L.12 (the
immediately preceding task) had already shipped real saving jars — a user
with an actual jar would see their own checklist incorrectly claim
"Saving plans" was still "coming soon." Fixed to read the real jar count
(`done`/`detail` now reflect whether any saving jar exists, linking to
`/ledger/budget` when none do), with a new passing test for the
now-`done: true` case alongside the existing `done: false` one.

Verified live end-to-end against the real dev database, not just the 15
new tests (97 total): seeded a second over-budget month for "Eating out"
(August €166.90, July €180.00, both against a €150.00 budget) and 4
Transport transactions (3 baseline ~€11.00 average, 1 latest at €40.00)
via direct SQL, then confirmed both exact insight strings — "Eating out
has run over budget 2 months running." and "Your latest Transport expense
of €40.00 is unusually large compared to your typical €11.00." — render
on desktop Overview, desktop Reports (both the August and July period
detail views, confirming the list is the same current, unscoped-to-period
data everywhere per its own doc comment), and mobile Reports (untruncated).
Confirmed mobile Overview shows **only** the first insight (the streak
one), matching `mobile-fork.md`'s explicit cap — verified directly against
the RSC payload (both strings present in the serialized data) versus the
rendered DOM (only one `<p>`), ruling out a data gap and confirming it's
the intentional `insights[0]` truncation in `MobileOverviewScreen`. Cleaned
up the seeded transactions afterward via direct SQL (no in-app deletion
path needed — these were plain expense transactions); confirmed the app
returned to its exact pre-verification state (no Insights section, Aug
spend back to €125.90). Full check suite — typecheck, lint, format:check,
`design:tokens:check`, and all 97 tests — passes clean.

This closes out **Phase F** — every task through L.13 is now shipped.

✅ **L.14 shipped (0.14.0)** — Settings: the first UI for backend capability
that had sat unused since L.3. Three flat sections on one screen —
Currencies (add, set base, delete), Incomes (add secondary, edit, delete),
Categories (Dynamic/Fixed only; Saving jars keep their existing home on
Budget) — with only Categories promoted to a detail view (`SettingsDetail`),
since it's the one section with real nested structure (a category owns a
list of kinds). Reused the `AccountsMain`/`AccountsDetail` select→detail
pattern faithfully, and `createCategoryWithKind` directly — it already
accepted `type: 'dynamic' | 'fixed' | 'saving'`, so "Add category" needed no
new backend action. Mobile has no footer capacity for a 6th icon (Ledger
already uses all 5 slots), so `MobileSettingsLink` — ported from
`sovereign-plugin-tally.local` — sits next to each Mobile\*Screen's own
`<h1>` instead of `PageHeader`'s `action` prop, since Ledger's mobile
screens hand-roll their own headers rather than using the shared component.

**Two real latent bugs, invisible until this task started exercising the
code paths that trigger them, fixed as part of it**: `deleteCurrency` had
no guard against deleting the currently-set base currency, silently kicking
the user back into the setup wizard's Step 1 the moment `getSetupStatus`
could no longer find one; `deleteCategory`/`deleteKind` had no guard
against `ledger_loans.linked_kind_id`'s FK (no cascade, by design —
`deleteLoan` already deletes the loan row before its kind for exactly this
reason), so deleting a loan-linked category/kind threw a raw, unhandled
`SQLITE_CONSTRAINT: FOREIGN KEY constraint failed` — reproduced live before
the fix landed. Both now return the shared result shape with a friendly
message, and the UI disables the affected delete controls up front
(prevention over error), backed by the server-side guard.

**A genuine product bug found live, not in either guard**: three of the
five new dialogs (`CreateCurrencyDialog`, `CreateIncomeDialog`,
`CreateCategoryDialog`) stay mounted across opens — `SettingsView` toggles
them via `open`, matching every other dialog in this app — so a
`useState` initializer computed from a prop (`available[0]?.code`,
`baseCurrencyCode`) only ever ran once, at first mount. Reproduced directly:
added a second currency, deleted the original base, then reopened "Add
currency" — the `<select>` visually showed the new correct default, but
submitting silently created a duplicate of the *previous* open's stale
selection instead. Fixed with a `useEffect` keyed on `open` alone (not the
prop, which would otherwise reset an in-progress selection on every
render) re-syncing the field the moment the dialog opens.
`CreateKindDialog`/`EditIncomeDialog` are conditionally rendered instead
(`{addKindTarget && <CreateKindDialog .../>}`) and don't share this bug —
React remounts them fresh on every open.

Verified live end-to-end, not just the 3 new tests (100 total): added and
deleted currencies including the base-swap and re-add scenario above;
added, edited, and deleted a secondary income; created a category with two
kinds, deleted one kind, then deleted the whole category; created a real
test loan from Accounts, confirmed both its linked kind's delete control
and the category's "Delete category" button were disabled with the
friendly "A loan is linked to..." message, deleted the loan, and confirmed
the same deletes then succeeded cleanly; confirmed the sidebar's Settings
link (replacing the "Soon" placeholder live since L.1) and all four mobile
screens' gear icons navigate correctly, and that the mobile Categories
drill-down reuses `SettingsDetail` verbatim behind a back header. Cleaned
up all test data afterward (test category, test loan) via the app's own
delete actions, confirming the app returned to its exact pre-verification
state. Full check suite — typecheck, lint, format:check,
`design:tokens:check`, and all 100 tests — passes clean.

This closes out **Phase G** and the full roadmap through L.14 — every
planned task for this plugin is now shipped.

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
authorization check is just "this row's `user_id` matches the caller's
session," never a membership or role check.

### Hard platform rules that apply here

- **SDK boundary:** import only `@sovereignfs/sdk` and `@sovereignfs/ui` —
  never `runtime/src` (ESLint-enforced).
- **Every server action authorizes inside the action**
  (`sdk.auth.requireSession()`, then the row's `user_id` must equal the
  session's user id — `tenant_id` is a separate, constant-in-v1 column, not
  the authorization boundary; see Data model) — route-level gating is never
  sufficient.
- **All tables slug-prefixed `ledger_`; `tenant_id` and `user_id` on every
  user-scoped table** — except `ledger_fx_rates`, deliberately untenanted
  (see Data model).
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
CONCEPT.md's "DB isolation mode" open question outright.

**`tenant_id` vs. `user_id` — a real distinction, not just naming.**
`tenant_id` is a platform-required, multi-tenancy-readiness column
(`docs/plugin-database.md`) — constant across this v1 single-tenant
instance, not the per-user scoping field. The actual owner of a row is
`user_id` (the session's real user id, `Actor.userId` in the data layer,
mirroring `sovereign-plugin-kanban.local`'s own `authz.ts`). Every table
below except `ledger_fx_rates` carries both; every "per-user" index and
constraint is keyed on `user_id`, never `tenant_id` alone — since
`tenant_id` is constant in v1, an index or primary key relying on it alone
would silently span every user on the instance rather than scoping to one.
`ledger_fx_rates` has neither: exchange rates are public, instance-wide
data, same rationale already used by `sovereign-plugin-sheets.local`'s own
`finance_rate_cache`.

```
ledger_currencies          id, tenant_id, user_id, code, is_base, timestamps
ledger_fx_rates            [UNTENANTED] id, currency_code, pivot_code, rate,
                           as_of_date, source (nullable)
ledger_incomes             id, tenant_id, user_id, label, amount, currency,
                           kind ('primary' | 'secondary'), timestamps
ledger_categories          id, tenant_id, user_id, name,
                           type ('dynamic' | 'fixed' | 'saving'), timestamps
ledger_kinds               id, tenant_id, user_id, category_id, name,
                           predicted_amount, currency, recurrence_interval_unit,
                           recurrence_interval_count, recurrence_anchor_date
                           (fixed-type only, else null), timestamps
ledger_transactions        id, tenant_id, user_id, kind_id, amount, currency,
                           occurred_at, note, timestamps
ledger_saving_jars         id, tenant_id, user_id, kind_id, balance, currency,
                           timestamps
ledger_jar_transactions    id, tenant_id, user_id, jar_id, amount (signed),
                           category_id (nullable), note, occurred_at
ledger_accounts            id, tenant_id, user_id, name, institution (nullable),
                           type ('bank' | 'credit_card'), balance, currency,
                           credit_limit (nullable), timestamps
ledger_assets              id, tenant_id, user_id, name,
                           type ('physical' | 'security'), value, currency,
                           timestamps
ledger_deposits            id, tenant_id, user_id, name, amount, currency,
                           timestamps
ledger_loans               id, tenant_id, user_id, name, lender, principal,
                           remaining_balance, installment_amount, currency,
                           start_date, end_date, linked_kind_id, timestamps
ledger_people              id, tenant_id, user_id, name, balance (cached, signed),
                           currency, timestamps
ledger_people_transactions id, tenant_id, user_id, person_id, amount (signed),
                           note, occurred_at
ledger_period_reviews      tenant_id, user_id, year, month, reviewed_at (not null)
```

Indexes: `ledger_transactions(user_id, kind_id, occurred_at)`,
`ledger_jar_transactions(user_id, jar_id, occurred_at)`,
`ledger_people_transactions(user_id, person_id, occurred_at)`,
`ledger_fx_rates` a lookup index on `(currency_code, pivot_code, as_of_date)`
for "the rate in effect on this transaction's date," and
`ledger_period_reviews` primary key on `(user_id, year, month)` — not
`(tenant_id, year, month)`, which would collide across every user.

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
   is simply the absence of a row for a past `(user_id, year, month)`.
5. **Found during L.2 implementation, before anything was committed: every
   table needed a separate `user_id`.** The original draft used `tenant_id`
   as if it were the per-user scoping column — it isn't (see above). Fixed
   across every table and every index/primary key before the L.2 migration
   was generated; no shipped migration ever had the bug.

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
  `sdk.auth.requireSession()` + a `user_id`-ownership check, returning
  `ActionResult`.
- Authorization unit tests: a session can never read or mutate another
  user's rows through any action.

**Dependencies:** L.2.

**Review checklist:** authz tests prove cross-user denial per action; no
action trusts a client-supplied `user_id`; attempting to create a
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
against the right kind. ~~The dialog's amount/note fields commit on blur,
not just Enter (`useCommitOnEnterOrBlur`).~~ **Corrected during
implementation:** CLAUDE.md's own quick-entry-input rule carves out
exactly this case — "a field inside a form with its own always-visible
submit button... should NOT commit on blur." This dialog has one ("Add
expense"), so amount/note are plain controlled fields submitted together
on click, not `useCommitOnEnterOrBlur` fields — the original wording here
misidentified this dialog as needing that hook before the exception was
fully understood.

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
the primary key on `(user_id, year, month)`).

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

---

#### L.14 — Settings

**Goal:** The `/ledger/settings` screen reserved since L.1's Routes table
but never built — the first real UI for backend capability that's sat
unused in `app/actions.ts` since L.3: currency, income, and category/kind
management beyond what the one-time setup wizard creates. The wizard's own
step-1 copy already promises "add more currencies anytime from Settings."

**Deliverables:**

- Currencies section: list, add, set-as-base, delete (base currency's
  delete disabled client-side, guarded server-side too).
- Incomes section: list, add secondary, edit label/amount, delete
  (primary income's delete disabled — setup-status requires exactly one).
- Categories section (Dynamic/Fixed only — Saving jars stay on Budget):
  list, add category+first kind (reuses `createCategoryWithKind`), select
  to a detail view showing the category's kinds with add-subcategory
  (`createKind`) and per-kind delete; kind budgeted amounts stay
  read-only here (edited only from Budget's existing `EditBudgetDialog`).
- `deleteCurrency` gains a guard rejecting deletion of the current base
  currency. `deleteCategory`/`deleteKind` gain a guard rejecting deletion
  when a loan's `linkedKindId` still references the kind(s) involved
  (previously an unguarded raw FK constraint crash — unreachable before
  this task since nothing called these two actions from a real UI).
- Sidebar's disabled "Settings — Soon" row becomes a real link. Mobile
  entry point via a `MobileSettingsLink` gear icon (ported from
  `sovereign-plugin-tally.local`'s own precedent for the identical
  footer-capacity constraint) placed next to each of the 4 primary mobile
  screens' own `<h1>` headers.

**Dependencies:** L.3 (the actions/queries this task builds UI for), L.7
(the loan-linkage guard references `ledger_loans`).

**Review checklist:** adding a second currency and setting it as base
flips which row's delete is disabled; deleting the sole/base currency is
rejected with a friendly error, not a crash; a secondary income can be
added, edited, and deleted, but the primary income's delete is disabled;
a new category+kind can be created and a second kind added to it; deleting
a loan-linked category or kind is rejected with a friendly error until the
loan itself is deleted from Accounts, after which the same delete
succeeds; the sidebar link and mobile gear icon both reach
`/ledger/settings` correctly on both breakpoints.
