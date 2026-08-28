import type { LedgerDb } from '../_db/client';
import { formatMoney } from './format';
import { listCategoriesWithKinds, listTransactions } from './queries';
import { getReportsData, type PeriodReport } from './reports';

/**
 * Rule-based budget-variance tips (L.13) — "a small rule set computed at
 * query time, no new table," per the task's own deliverables. Two rules:
 * a category over budget for multiple consecutive months, and a single
 * transaction unusually large relative to its kind's typical spend.
 *
 * **Threshold is 2 consecutive months, not the 3 in `web-shell.md`'s own
 * Reports wireframe example** ("Eating out has run over budget 3 months
 * running"). CONCEPT.md's own wording is just "multiple consecutive
 * months" — no fixed number — and 2 is the smallest value "multiple" can
 * mean; it's also the threshold the L.13 review checklist's own test
 * scenario is written to exercise ("a SECOND seeded month with a
 * deliberately over-budget category produces exactly the expected tip" —
 * unreachable with a 3-month threshold from just two periods). The
 * rendered copy always states the *real* computed streak length, not this
 * constant, so a streak that happens to reach 3 reproduces the wireframe's
 * own example text verbatim without hardcoding it.
 *
 * **No display cap anywhere insights are shown** (Overview, Reports, both
 * desktop and mobile) — every wireframe mockup happens to show only one
 * insight card, but that reads as "this demo data only triggered one
 * rule," not a hard "show at most N" requirement stated anywhere in
 * CONCEPT.md or this task's own deliverables. Simpler to reason about and
 * test than an arbitrary ranking/truncation policy nobody asked for.
 */
const CONSECUTIVE_OVER_BUDGET_THRESHOLD = 2;

/** "Unusually large" — the latest transaction for a kind is flagged once
 *  it's at least this many times the average of every prior transaction
 *  for that same kind. A simple heuristic, not a statistical outlier
 *  test — matches this task's own "small rule set" framing. */
const LARGE_TRANSACTION_MULTIPLIER = 2;

/** Below this many *prior* transactions for a kind, there's no meaningful
 *  "typical spend" baseline yet — the review checklist's own "zero false
 *  positives... nothing to compare against yet" requirement. */
const MIN_PRIOR_TRANSACTIONS_FOR_BASELINE = 3;

/**
 * Walks `periods` (most-recent-first, `getReportsData`'s own contract)
 * per category, counting how many consecutive periods — starting from the
 * most recent — had `actualMinor > predictedMinor`. Sourced from
 * `topCategories` rather than a dedicated per-category-per-period query:
 * `getReportsData` already computes this exact comparison for its own
 * Reports screen, and re-deriving it here would be a second, divergent
 * implementation of the same math. A category outside the top 5 in some
 * period (rare at this app's real single-user scale — `topCategories`
 * already includes every category with any real spend, up to 5) reads as
 * "not over budget that period," breaking its streak — a documented,
 * deliberate simplification, not an oversight.
 */
export function computeOverBudgetStreakInsights(periods: PeriodReport[]): string[] {
  const categoryNames = new Map<string, string>();
  for (const period of periods) {
    for (const category of period.topCategories) categoryNames.set(category.categoryId, category.name);
  }

  const insights: string[] = [];
  for (const [categoryId, name] of categoryNames) {
    let streak = 0;
    for (const period of periods) {
      const entry = period.topCategories.find((c) => c.categoryId === categoryId);
      const overBudget = entry !== undefined && entry.predictedMinor > 0 && entry.actualMinor > entry.predictedMinor;
      if (!overBudget) break;
      streak += 1;
    }
    if (streak >= CONSECUTIVE_OVER_BUDGET_THRESHOLD) {
      insights.push(`${name} has run over budget ${streak} months running.`);
    }
  }
  return insights;
}

export interface InsightTransaction {
  kindId: string;
  amountMinor: number;
  occurredAt: number;
  currency: string;
}

/**
 * For each kind with enough history, compares its single most recent
 * transaction against the average of every earlier one. Scoped to "the
 * latest transaction only" (not every historically-anomalous one) so a
 * one-off spike from months ago doesn't sit in this list forever — the
 * actionable moment is when it just happened, not every time this
 * function runs afterward.
 */
export function computeLargeTransactionInsights(
  transactions: InsightTransaction[],
  kindNames: Map<string, string>,
): string[] {
  const byKind = new Map<string, InsightTransaction[]>();
  for (const tx of transactions) {
    const list = byKind.get(tx.kindId) ?? [];
    list.push(tx);
    byKind.set(tx.kindId, list);
  }

  const insights: string[] = [];
  for (const [kindId, txs] of byKind) {
    if (txs.length < MIN_PRIOR_TRANSACTIONS_FOR_BASELINE + 1) continue;
    const [latest, ...prior] = [...txs].sort((a, b) => b.occurredAt - a.occurredAt);
    if (!latest) continue;

    const averagePriorMinor = prior.reduce((sum, tx) => sum + tx.amountMinor, 0) / prior.length;
    if (averagePriorMinor > 0 && latest.amountMinor >= averagePriorMinor * LARGE_TRANSACTION_MULTIPLIER) {
      const name = kindNames.get(kindId) ?? 'expense';
      insights.push(
        `Your latest ${name} expense of ${formatMoney(latest.amountMinor, latest.currency)} is unusually large compared to your typical ${formatMoney(Math.round(averagePriorMinor), latest.currency)}.`,
      );
    }
  }
  return insights;
}

/** Overview's and Reports' shared insights payload — reuses `getReportsData`
 *  (L.8) rather than a second implementation of the same budget-variance
 *  math, per this task's own explicit requirement. */
export async function getInsights(db: LedgerDb, userId: string): Promise<string[]> {
  const [{ periods }, transactions, categoriesWithKinds] = await Promise.all([
    getReportsData(db, userId),
    listTransactions(db, userId),
    listCategoriesWithKinds(db, userId),
  ]);

  const kindNames = new Map(
    categoriesWithKinds.flatMap((category) => category.kinds.map((kind) => [kind.id, kind.name] as const)),
  );

  return [
    ...computeOverBudgetStreakInsights(periods),
    ...computeLargeTransactionInsights(transactions, kindNames),
  ];
}
