# Ledger — Roadmap

**Manifest version:** 0.14.0 · **Last updated:** 2026-08-28

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

| Slot  | Task                                  | Status | Spec task                                                |
| ----- | -------------------------------------- | ------ | --------------------------------------------------------- |
| 0.1.0 | Plugin scaffold & manifest             | ✅     | [L.1](SPEC.md#l1--plugin-scaffold--manifest)               |
| 0.2.0 | Data model & migrations                | ✅     | [L.2](SPEC.md#l2--data-model--migrations)                  |
| 0.3.0 | Server data layer & actions skeleton   | ✅     | [L.3](SPEC.md#l3--server-data-layer--actions-skeleton)     |

## Phase B — Core budget loop

| Slot  | Task                                  | Status | Spec task                                     |
| ----- | -------------------------------------- | ------ | ----------------------------------------------- |
| 0.4.0 | Setup wizard                           | ✅     | [L.4](SPEC.md#l4--setup-wizard)                 |
| 0.5.0 | Web Overview + Budget                  | ✅     | [L.5](SPEC.md#l5--web-overview--budget)         |
| 0.6.0 | Expense entry                          | ✅     | [L.6](SPEC.md#l6--expense-entry)                |

## Phase C — Net worth & reporting

| Slot  | Task                                  | Status | Spec task                                          |
| ----- | -------------------------------------- | ------ | ---------------------------------------------------- |
| 0.7.0 | Accounts                               | ✅     | [L.7](SPEC.md#l7--accounts)                          |
| 0.8.0 | Reports + month-end review             | ✅     | [L.8](SPEC.md#l8--reports--month-end-review)         |

## Phase D — Mobile

| Slot  | Task                                  | Status | Spec task                              |
| ----- | -------------------------------------- | ------ | ----------------------------------------- |
| 0.9.0 | Mobile fork                            | ✅     | [L.9](SPEC.md#l9--mobile-fork)            |

## Phase E — Automation

| Slot   | Task                                  | Status | Spec task                                                 |
| ------ | -------------------------------------- | ------ | ------------------------------------------------------------ |
| 0.10.0 | FX rate background job                 | ✅     | [L.10](SPEC.md#l10--fx-rate-background-job)                 |
| 0.11.0 | Month-end report generation            | ✅     | [L.11](SPEC.md#l11--month-end-report-generation)             |

## Phase F — Saving jars & insights

| Slot   | Task                                  | Status | Spec task                                    |
| ------ | -------------------------------------- | ------ | ----------------------------------------------- |
| 0.12.0 | Saving jars                            | ✅     | [L.12](SPEC.md#l12--saving-jars)                |
| 0.13.0 | Rule-based insights                    | ✅     | [L.13](SPEC.md#l13--rule-based-insights)        |

## Phase G — Settings

| Slot   | Task                                  | Status | Spec task                        |
| ------ | -------------------------------------- | ------ | ----------------------------------- |
| 0.14.0 | Settings                               | ✅     | [L.14](SPEC.md#l14--settings)       |

---

**Status legend:** ✅ done · 🚧 in progress · ⬜ not started.

Naming/trademark risk on "Ledger" itself (CONCEPT.md §7) is unresolved and
tracked there, not here — it doesn't block any task above while this stays
a `.local` dev plugin.
