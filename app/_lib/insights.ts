import type { LedgerDb } from '../_db/client';
import { formatMoney } from './format';
import { listCategoriesWithKinds, listTransactions } from './queries';
import { getReportsData, type PeriodReport, type ReportsData } from './reports';

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
 * mean. The rendered copy always states the *real* computed streak length,
 * not this constant.
 *
 * **Streaks are counted from the last *completed* month.** The current
 * month is still accumulating — early in it, almost nothing is over
 * budget yet, and a category with no spend at all is absent from that
 * period's `topCategories` — so starting the walk there broke every streak
 * at index 0 and the rule effectively never fired. The current period is
 * skipped (not counted for or against), then consecutive completed months
 * are walked backwards.
 *
 * **No display cap anywhere insights are shown** — every wireframe mockup
 * happens to show only one insight card, but that reads as "this demo data
 * only triggered one rule," not a hard "show at most N" requirement.
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

/** A large-transaction tip is only actionable while it's recent — a spike
 *  from months ago shouldn't sit on Overview forever just because nothing
 *  newer was logged against that kind. */
const LARGE_TRANSACTION_MAX_AGE_DAYS = 45;

/**
 * Walks `periods` (most-recent-first, `getReportsData`'s own contract)
 * per category, counting how many consecutive *completed* periods had
 * `actualMinor > predictedMinor`. Sourced from `topCategories` rather than
 * a dedicated per-category-per-period query: `getReportsData` already
 * computes this exact comparison for its own Reports screen. A category
 * outside the top 5 in some period (rare at this app's real single-user
 * scale) reads as "not over budget that period," breaking its streak — a
 * documented, deliberate simplification.
 */
export function computeOverBudgetStreakInsights(periods: PeriodReport[]): string[] {
  const completed = periods.filter((p) => !p.isCurrent);
  const categoryNames = new Map<string, string>();
  for (const period of completed) {
    for (const category of period.topCategories) {
      categoryNames.set(category.categoryId, category.name);
    }
  }

  const insights: string[] = [];
  for (const [categoryId, name] of categoryNames) {
    let streak = 0;
    for (const period of completed) {
      const entry = period.topCategories.find((c) => c.categoryId === categoryId);
      const overBudget =
        entry !== undefined && entry.predictedMinor > 0 && entry.actualMinor > entry.predictedMinor;
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
 * transaction (if it's recent enough to still be actionable) against the
 * average of every earlier one. Scoped to "the latest transaction only"
 * (not every historically-anomalous one) so a one-off spike from months
 * ago doesn't sit in this list forever — the actionable moment is when it
 * just happened, not every time this function runs afterward.
 */
export function computeLargeTransactionInsights(
  transactions: InsightTransaction[],
  kindNames: Map<string, string>,
  now: number = Date.now(),
): string[] {
  const byKind = new Map<string, InsightTransaction[]>();
  for (const tx of transactions) {
    const list = byKind.get(tx.kindId) ?? [];
    list.push(tx);
    byKind.set(tx.kindId, list);
  }

  const maxAgeMs = LARGE_TRANSACTION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const insights: string[] = [];
  for (const [kindId, txs] of byKind) {
    if (txs.length < MIN_PRIOR_TRANSACTIONS_FOR_BASELINE + 1) continue;
    const [latest, ...prior] = [...txs].sort((a, b) => b.occurredAt - a.occurredAt);
    if (!latest || now - latest.occurredAt > maxAgeMs) continue;

    const averagePriorMinor = prior.reduce((sum, tx) => sum + tx.amountMinor, 0) / prior.length;
    if (
      averagePriorMinor > 0 &&
      latest.amountMinor >= averagePriorMinor * LARGE_TRANSACTION_MULTIPLIER
    ) {
      const name = kindNames.get(kindId) ?? 'expense';
      // Server-rendered copy with no viewer locale available at this
      // layer; `en-US` keeps it deterministic between SSR and hydration.
      insights.push(
        `Your latest ${name} expense of ${formatMoney(latest.amountMinor, latest.currency, 'en-US')} is unusually large compared to your typical ${formatMoney(Math.round(averagePriorMinor), latest.currency, 'en-US')}.`,
      );
    }
  }
  return insights;
}

/**
 * Overview's and Reports' shared insights payload — reuses `getReportsData`
 * (L.8) rather than a second implementation of the same budget-variance
 * math. A caller that has already computed the reports payload for its own
 * screen passes it in so the (comparatively expensive) report math runs
 * once per request, not twice.
 */
export async function getInsights(
  db: LedgerDb,
  userId: string,
  reports?: ReportsData,
  now: number = Date.now(),
): Promise<string[]> {
  const [{ periods }, transactions, categoriesWithKinds] = await Promise.all([
    reports ?? getReportsData(db, userId, now),
    listTransactions(db, userId),
    listCategoriesWithKinds(db, userId),
  ]);

  const kindNames = new Map(
    categoriesWithKinds.flatMap((category) =>
      category.kinds.map((kind) => [kind.id, kind.name] as const),
    ),
  );

  return [
    ...computeOverBudgetStreakInsights(periods),
    ...computeLargeTransactionInsights(transactions, kindNames, now),
  ];
}
