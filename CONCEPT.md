# Ledger — concept

**Status:** Concept (pre-RFC, pre-roadmap)\
**Date:** 2026-08-27\
**Scope:** A new Sovereign plugin (`.local` dev plugin in this checkout,
externally-maintained-style — same pattern as `sovereign-plugin-tally.local`
and `sovereign-plugin-tasks.local`). No epic task or RFC exists yet; this doc
is the starting point for both.\
**Closest reference:** [YNAB](https://www.ynab.com/) for the
budgeting philosophy (zero-based, category-level predicted-vs-actual);
[Firefly III](https://www.firefly-iii.org/) as the closest self-hosted,
open-source structural analog (budgets, recurring bills, "piggy banks",
multi-currency, full net worth) — see also
[Actual Budget](https://actualbudget.org/), another open-source YNAB-alike.\
**Origin:** modeled directly on the developer's own multi-year manual budget
spreadsheet (a personal Google Sheet). This doc describes the general
structure that spreadsheet revealed, not any of its actual figures — no
personal financial data from it is reproduced here.

---

## 1. Problem

Personal budgeting tools generally force a choice: a simple expense tracker
(easy to use, but no real budget discipline — "where did my money go" after
the fact), or a full budgeting system (YNAB-style envelope discipline, but
usually single-currency, subscription-priced, and cloud-hosted with your
full financial picture living on someone else's server). Neither option
covers, in one place:

- A **predicted-vs-actual budget** at the category/kind level, for both
  irregular spending and recurring bills — not just "you spent $X in
  Groceries" but "you budgeted $Y and spent $X."
- **Genuine multi-currency**, where different accounts, bills, and assets
  are natively denominated in different currencies (rent in one currency,
  a phone bill in another, savings in a third) and everything still rolls
  up into one coherent picture.
- A **full net-worth view** alongside the budget — bank accounts, credit
  cards, investments, physical assets, security deposits, loans, and
  informal debts/credits with people — not just transaction categorization.
- **Envelope-style saving sub-accounts** that track a real running balance
  (money actually set aside and later drawn down for its purpose), not just
  a monthly savings target.

This is exactly what a detailed personal spreadsheet ends up modeling by
hand, because no single mainstream tool covers all four without a
subscription, a cloud dependency, or dropping one of the four requirements
outright (most drop multi-currency or net-worth breadth).

## 2. Solution — what Ledger is

Ledger is Sovereign's budget-based personal finance tracker: set up a
budget once (currencies, incomes, fixed/dynamic expense categories, saving
plans, and a full balance sheet of accounts/assets/liabilities), then track
actual spending against it, review monthly, and get a net-worth-aware
picture of where things stand — running entirely on infrastructure the user
already owns.

**Why this is a good fit for Sovereign specifically:**

- **Strictly single-user.** Unlike a shared-expense tool, a personal budget
  has one owner. No group/membership model needed — every authorization
  check is just "does this session own this budget," which keeps the whole
  plugin simpler than a multi-party one.
- **Privacy is the actual value proposition, not a slogan.** A full net
  worth picture — bank balances, loan amounts, who owes whom — is about as
  sensitive as personal data gets. Self-hosted is a genuine requirement
  here, not a preference.
- **No forced simplification.** Commercial tools that support multi-currency
  and full net-worth tracking (Monarch, Copilot) do so behind a paid
  subscription; the open-source self-hosted options that are free
  (Actual Budget) generally don't support multi-currency well. Ledger can
  target both without a monetization tension forcing a trade-off.

## 3. Competitive positioning

| | YNAB | Firefly III | Actual Budget | **Ledger (v1 target)** |
|---|---|---|---|---|
| Budgeting model | Zero-based envelopes | Budgets + available-per-period | Zero-based envelopes | Predicted vs. actual per category/kind |
| Multi-currency | Single currency per budget | Yes, native, robust | No (single currency, workarounds only) | Yes — core requirement |
| Net worth (assets/liabilities) | Basic, not the focus | Yes — full account/asset/liability model | Basic account tracking only | Yes — accounts, cards, stock/assets, deposits, loans, people |
| Recurring bills | Yes (scheduled transactions) | Yes ("Bills", flexible date ranges) | Yes (scheduled transactions) | Yes — flexible recurrence (day/week/month/year × N) |
| Envelope/goal sub-accounts | Categories double as envelopes | "Piggy banks" (separate, running balance) | Category rollover | **Saving Jars** — separate, running balance, contribution + withdrawal |
| Bank sync | Yes (Plaid) | Optional, via separate importer | Yes (SimpleFin/Plaid bridge) | No (manual) — deferred |
| Receipt scanning | No | No | No | No — deferred |
| Insights | Spending reports only | Basic reports/charts | Basic reports | Rule-based budget-variance tips (v1); AI insights a natural post-v1 fit |
| Pricing | Subscription (~$109/yr) | Free, open source | Free / low-cost hosted option | Free, bundled with the user's own instance |
| Self-hosted | No | Yes | Optional | Yes, inherently |

Firefly III is the structurally closest match — its "Bills" and "Piggy
banks" map almost directly onto this plugin's Fixed Expenses and Saving
Jars. YNAB is the category-defining product for the budgeting *discipline*
(predicted vs. actual), which Ledger borrows without adopting strict
zero-based allocation of every unit of currency. Ledger's differentiation
is combining Firefly III's breadth (multi-currency, full net worth) with
YNAB's budget-discipline UX, as a plugin on a platform the user already
runs.

## 4. V1 feature scope

### First-run budget setup

A guided setup wizard, run once per user on first login:

1. **Base currency**, plus any number of additional supported currencies —
   editable later, not locked in at setup.
2. **Incomes** — one primary monthly income; any number of labeled secondary
   incomes (label + amount).
3. **Fixed expenses** — Category → Kind, each with a predicted amount and a
   flexible recurrence (monthly, yearly, or every N days/weeks/months/years).
4. **Dynamic expenses** — Category → Kind, each with a monthly predicted
   amount (the ongoing budget target; actual spend is logged continuously,
   see below).
5. **Saving plans** — Category → Kind, each with a monthly saving amount.
   Creating a saving plan creates a linked **Saving Jar** (see below).
6. **Bank accounts** — identifier (not an account number) + starting
   balance + currency.
7. **Credit cards** — identifier + credit limit, no card numbers.
8. **Stock / investment holdings.**
9. **Deposits** — money held as security (e.g. apartment deposits).
10. **Creditors and debtors** — a single **People** ledger, signed amount
    (positive = owed to the user, negative = the user owes them).
11. **Loans** — monthly installment, start date, end date, remaining
    balance/lender. Creating a loan auto-generates its linked Fixed expense
    for the installment, so the installment is never entered twice.

Once complete, the budget is active and the app moves into ongoing use.

### Ongoing expense tracking

- Log a **Dynamic** expense: amount, category, kind, date — optionally
  marked as funded from a **Saving Jar** instead of general spend (a
  withdrawal against that jar's balance, e.g. booking a trip against the
  Travel jar) rather than a new out-of-pocket dynamic expense.
- **Fixed** expense actuals default to their predicted amount each period;
  the user only edits a period's actual when it genuinely drifted (e.g. a
  utility bill that varies slightly), rather than re-entering a stable
  number every cycle.
- **Saving Jar** contributions post automatically from the linked saving
  plan each period; manual contributions/withdrawals are also possible.

### Reports

- Monthly and yearly views, by category and by kind.
- Predicted vs. actual comparison at every rollup level.
- Three savings figures: **projected** (income − predicted expenses),
  **actual** (income − actual expenses), and **actual net of saving-jar
  contributions**.
- Total income and total expenses.
- Mini overviews: credit card balances/utilization, debts/credits owed,
  loan balances remaining.
- An auto-generated report for the prior month, delivered on the 1st of
  each month via email and as an in-app notification.

### Insights

- Rule-based budget-variance flags for v1 (e.g. a category running over
  budget for multiple consecutive months, unusually large single
  transactions relative to a kind's typical spend).

### Month-end review

- Mark the month reviewed.
- Adjust predicted amounts for fixed expenses and dynamic budgets going
  into the next period.

### Multi-currency

- Any number of supported currencies per budget, added at setup or later.
- A daily background job fetches exchange rates for every supported
  currency (fiat and crypto alike, sourced from different upstream feeds
  into the same rate table) against a single pivot currency; cross-rates
  are derived at query time.
- Historical reports convert using the rate in effect on each transaction's
  own date, not the current rate.
- This lives entirely inside the Ledger plugin (its own table, its own
  scheduled job) — not a platform-level capability. See §5.

## 5. Sovereign platform fit

Rough read of `packages/sdk/src/`, to be confirmed once implementation
starts:

- `db.ts` — plugin's own tables: budget, incomes, expense categories/kinds,
  fixed-expense schedules, dynamic transactions, saving plans/jars + their
  transactions, accounts, cards, assets, deposits, loans, people, exchange
  rates.
- `auth.ts` / `authz.ts` — every server action authorizes inside the action
  itself (session + capability check), per the platform's hard rule. Simple
  here: authorization is just "this budget belongs to the caller's own
  session" — no cross-user resource sharing to model.
- `mailer.ts` — the monthly recap email.
- `notifications.ts` — the in-app counterpart to the monthly recap, and
  budget-variance insight surfacing.
- **Background jobs — the manifest's `schedules` mechanism** (a `ScheduleHandler`
  default export in `app/_jobs/*.ts`, invoked on an `intervalMinutes` floor,
  same pattern `sovereign-tasks`' due-reminders job already uses): needed
  for both the daily FX-rate fetch and the monthly report generation. The
  scheduler only offers an interval floor, not calendar/cron semantics, so
  the monthly-report handler runs on a short interval (e.g. daily) and
  internally gates on "is it the 1st, and have I already generated this
  period's report" — idempotent by design, which the platform's own
  schedule-handler contract already requires.
- `storage.ts` — not needed for v1 (only relevant once receipt
  attach/OCR is built, which is deferred — see §6).
- `data.ts` (cross-plugin data contracts, RFC 0002) — not needed for v1;
  a plausible future seam if another plugin ever wants read access to
  net-worth data, not designed for now.

No blocking platform gap identified — v1 scope looks buildable entirely on
primitives the platform already has, including the exact background-job
mechanism the FX-rate fetch needs.

## 6. Explicitly out of scope for v1 (non-goals)

1. **Bill upload / OCR auto-decoding of expenses** — real value, later
   phase.
2. **Automated bank-balance fetching / aggregation** — manual balance entry
   for v1.
3. **Live stock/asset price feeds** — asset and stock values are manually
   updated. (Contrast with currency/crypto *exchange rates*, which **are**
   automated in v1 — see §4.)
4. **Automated interest-income calculation** — manual entry.
5. **AI/LLM-generated insights** — rule-based only for v1. Sovereign's
   recently-landed BYO model provider support (RFC 0063) is a natural home
   for an AI-insights pass later, not designed against now.
6. **Shared/household budgets** — strictly per-user, confirmed directly.
   Not a phased deferral so much as a firm scope boundary for this plugin.
7. **A platform-level FX/currency-conversion SDK capability** — deliberately
   kept plugin-local (§4). Only worth promoting to `packages/sdk` via its
   own RFC if a second plugin later needs currency conversion; not built
   speculatively now.

## 7. Open questions

- **Naming/trademark risk is real here, unlike Tally's.** "Ledger" is also
  the brand of a very well-known hardware crypto wallet company
  (Ledger SAS, ledger.com) with strong fintech/crypto brand recognition —
  a materially higher collision risk than Tally's own naming check turned
  up. Worth a real trademark/registry check before this plugin is ever
  published to `registry/plugins.json` or given a public repo name, even
  though it's low-stakes as a `.local` dev plugin today.
- ~~**Default Category/Kind seed set.**~~ **Resolved** in
  `docs/adhoc/setup-wizard.md` screen 3: suggested categories are tappable
  chips with pre-filled, editable budget amounts — never auto-created
  without a tap, no seed data written until the user picks one.
- ~~**DB isolation mode**~~ **Resolved, and it was never actually a
  choice**: `packages/manifest/src/schema.ts`'s `manifestDatabaseIsolation()`
  is unconditionally `'isolated'` for any `type` other than `platform` — see
  `SPEC.md`'s Data model section.
- **Exchange rate source(s)** — which upstream API(s) for fiat vs. crypto
  rates. Ideally something that works with no required API key by default
  for self-hosters (matching the mailer's own "no-op when unconfigured"
  precedent), with a configurable key for higher rate limits. Still open —
  `SPEC.md`'s L.10 defers the exact provider choice to implementation time.
- **Predicted-amount history.** If a predicted (budgeted) amount is revised
  at a month-end review, should Ledger keep the old value effective-dated
  so a report generated for an earlier month still reflects what was
  budgeted *then* — or does "predicted" only ever reflect the current
  value? Affects whether historical reports stay accurate after a
  mid-year budget adjustment. Still open — `SPEC.md` documents this as a
  known v1 limitation rather than resolving it: `predicted_amount` has no
  effective-dating in the Phase 1 schema.
- ~~**Fixed-expense recurrence model**~~ **Resolved** in `SPEC.md`'s Data
  model: `ledger_kinds` carries `recurrence_interval_unit`/
  `recurrence_interval_count`/`recurrence_anchor_date` for fixed-type kinds.

## Next step

**Done:** wireframes (`docs/adhoc/{web-shell,mobile-fork,setup-wizard}.md`),
data model + task backlog (`SPEC.md`), and build order (`ROADMAP.md`) — all
in place. Implementation proceeds one `L.<n>` task at a time per `SPEC.md`,
starting with L.1 (plugin scaffold). This stays a `.local` dev plugin
unless/until there's a reason to propose it as a first-party bundled
plugin, at which point it would follow the platform's normal
research → RFC → epic pipeline.
