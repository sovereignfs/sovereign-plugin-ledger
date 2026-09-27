# Ledger — Roadmap

**Manifest version:** 0.16.0 · **Last updated:** 2026-09-27

Chronological build index — one row per PR, platform-`ROADMAP.md` style. Full
task detail lives in [SPEC.md](SPEC.md); the product concept in
[CONCEPT.md](CONCEPT.md); UI flow and wireframes in
[docs/adhoc/](docs/adhoc/).

Slot versions are the plugin's **`manifest.json`** version after that task
lands (the plugin's `package.json` stays pinned at `0.0.0` — platform
convention). Slots are volatile ordering; task IDs (`L.<seq>`) are the
stable identifiers. Each task = one branch = one PR = one review gate; tasks
depend on the previous row unless noted.

## Phase A — Foundation

| Slot  | Task                                 | Status | Spec task                                              |
| ----- | ------------------------------------ | ------ | ------------------------------------------------------ |
| 0.1.0 | Plugin scaffold & manifest           | ✅     | [L.1](SPEC.md#l1--plugin-scaffold--manifest)           |
| 0.2.0 | Data model & migrations              | ✅     | [L.2](SPEC.md#l2--data-model--migrations)              |
| 0.3.0 | Server data layer & actions skeleton | ✅     | [L.3](SPEC.md#l3--server-data-layer--actions-skeleton) |

## Phase B — Core budget loop

| Slot  | Task                  | Status | Spec task                               |
| ----- | --------------------- | ------ | --------------------------------------- |
| 0.4.0 | Setup wizard          | ✅     | [L.4](SPEC.md#l4--setup-wizard)         |
| 0.5.0 | Web Overview + Budget | ✅     | [L.5](SPEC.md#l5--web-overview--budget) |
| 0.6.0 | Expense entry         | ✅     | [L.6](SPEC.md#l6--expense-entry)        |

## Phase C — Net worth & reporting

| Slot  | Task                       | Status | Spec task                                    |
| ----- | -------------------------- | ------ | -------------------------------------------- |
| 0.7.0 | Accounts                   | ✅     | [L.7](SPEC.md#l7--accounts)                  |
| 0.8.0 | Reports + month-end review | ✅     | [L.8](SPEC.md#l8--reports--month-end-review) |

## Phase D — Mobile

| Slot  | Task        | Status | Spec task                      |
| ----- | ----------- | ------ | ------------------------------ |
| 0.9.0 | Mobile fork | ✅     | [L.9](SPEC.md#l9--mobile-fork) |

## Phase E — Automation

| Slot   | Task                        | Status | Spec task                                        |
| ------ | --------------------------- | ------ | ------------------------------------------------ |
| 0.10.0 | FX rate background job      | ✅     | [L.10](SPEC.md#l10--fx-rate-background-job)      |
| 0.11.0 | Month-end report generation | ✅     | [L.11](SPEC.md#l11--month-end-report-generation) |

## Phase F — Saving jars & insights

| Slot   | Task                | Status | Spec task                                |
| ------ | ------------------- | ------ | ---------------------------------------- |
| 0.12.0 | Saving jars         | ✅     | [L.12](SPEC.md#l12--saving-jars)         |
| 0.13.0 | Rule-based insights | ✅     | [L.13](SPEC.md#l13--rule-based-insights) |

## Phase G — Settings

| Slot   | Task     | Status | Spec task                     |
| ------ | -------- | ------ | ----------------------------- |
| 0.14.0 | Settings | ✅     | [L.14](SPEC.md#l14--settings) |

## Phase H — Review fixes

| Slot   | Task                              | Status | Spec task                              |
| ------ | --------------------------------- | ------ | -------------------------------------- |
| 0.15.0 | Full review — bugs, UX gaps, docs | ✅     | [L.15](SPEC.md#l15--full-review-fixes) |

## Phase J — Second review pass

| Slot   | Task                                             | Status | Spec task                               |
| ------ | ------------------------------------------------ | ------ | --------------------------------------- |
| 0.16.0 | Portability, multi-currency and validation fixes | ✅     | [L.16](SPEC.md#l16--second-review-pass) |

## Phase I — CONCEPT.md §4 scope not yet built

Tracked here so nothing in the concept's v1 scope is silently missing;
none of these is scheduled yet. Each gets its own `L.<n>` spec entry when
picked up.

| Slot | Task                                                                | Status | Spec task |
| ---- | ------------------------------------------------------------------- | ------ | --------- |
| —    | Fixed-expense recurrence (the `recurrence_*` columns are never set) | ⬜     | —         |
| —    | Fixed actuals defaulting to their budgeted amount each period       | ⬜     | —         |
| —    | Automatic monthly jar contributions from the linked saving plan     | ⬜     | —         |
| —    | Yearly report view (by category and by subcategory)                 | ⬜     | —         |
| —    | Effective-dated budget/income history (CONCEPT.md §7 open question) | ⬜     | —         |

## Deferred repository work

Not product scope — how this repository is built and checked. Tracked so it
is not silently dropped.

| Slot | Task                                                               | Status | Spec task |
| ---- | ------------------------------------------------------------------ | ------ | --------- |
| —    | CI: compose into a platform checkout and run its gates on every PR | ⬜     | —         |

The only workflows here move the `latest`/`stable` branches, so typecheck,
lint, formatting and the test suite have never run on a push or a pull
request — they are run by hand from a platform checkout with this plugin
composed in at `plugins/ledger.local/`. A workflow doing that was built
during L.16 and pulled back out on review as a build-tooling change that
belongs in its own PR. Note when picking it up: `pnpm/action-setup` resolves
`packageManager` relative to the _job's_ working directory, and this repo's
`package.json` has no such field — the monorepo's does, so the action needs
an explicit `version` or a `package_json_file` pointing into the platform
checkout.

---

**Status legend:** ✅ done · 🚧 in progress · ⬜ not started.

Naming/trademark risk on "Ledger" itself (CONCEPT.md §7) is unresolved and
tracked there, not here — it doesn't block any task above while this stays
a `.local` dev plugin.
