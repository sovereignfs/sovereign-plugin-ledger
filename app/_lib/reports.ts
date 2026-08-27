import { eq } from 'drizzle-orm';
import type { LedgerDb } from '../_db/client';
import * as schema from '../_db/schema';
import { sumConvertedToBase } from './money';
import { getMonthRange, getUtcYearMonth } from './period';
import { listCategoriesWithKinds, listTransactions } from './queries';

/** Threshold under which a category reads as "on budget" rather than a
 *  signed percentage — an exact 0% match is rare with real spending, so a
 *  small band avoids "on budget"/"+1% vs. budget" flapping for noise. */
const ON_BUDGET_THRESHOLD_PCT = 5;

export interface ReportTopCategory {
  categoryId: string;
  name: string;
  actualMinor: number;
  predictedMinor: number;
  currency: string;
  /** `null` when the category has no budget to compare against. */
  varianceLabel: string | null;
}

export interface PeriodReport {
  year: number;
  /** 1-indexed (January = 1). */
  month: number;
  incomeMinor: number;
  spentMinor: number;
  projectedSavingsMinor: number;
  actualSavingsMinor: number;
  /**
   * `actualSavingsMinor` adjusted for jar withdrawals during the period —
   * a jar-funded expense is never a `ledger_transactions` row (SPEC.md's
   * Data model correction #3), so `actualSavingsMinor` alone overstates
   * true savings by however much was actually spent via a jar. Contributions
   * don't affect this figure at all: moving cash into a jar doesn't change
   * total household savings, only where it sits. Always equal to
   * `actualSavingsMinor` today — no `ledger_jar_transactions` row can exist
   * until L.12 ships saving jars, so the adjustment term is inert, not
   * hardcoded to zero.
   */
  actualSavingsNetOfJarsMinor: number;
  reviewed: boolean;
  reviewedAt: number | null;
  topCategories: ReportTopCategory[];
}

export interface ReportsData {
  baseCurrencyCode: string;
  /** Most recent first. */
  periods: PeriodReport[];
}

function periodKey(year: number, month: number): string {
  return `${year}-${month}`;
}

/**
 * Reports' one-round-trip payload — every period with any transaction
 * activity, each fully detailed (same "preload everything, no
 * fetch-on-selection" choice as Budget/Accounts). A known simplification,
 * same shape as `predictedAmountMinor`'s own documented non-effective-dating
 * gap: income and budgeted amounts have no history, so every period's
 * "income"/"projected savings" reflects the user's *current* declared
 * income and budget, not what was actually true back then.
 */
export async function getReportsData(db: LedgerDb, userId: string): Promise<ReportsData> {
  const [currencies, incomes, categoriesWithKinds, allTransactions, jarTransactions, reviews] =
    await Promise.all([
      db.select().from(schema.currencies).where(eq(schema.currencies.userId, userId)),
      db.select().from(schema.incomes).where(eq(schema.incomes.userId, userId)),
      listCategoriesWithKinds(db, userId),
      listTransactions(db, userId),
      db.select().from(schema.jarTransactions).where(eq(schema.jarTransactions.userId, userId)),
      db.select().from(schema.periodReviews).where(eq(schema.periodReviews.userId, userId)),
    ]);

  const baseCurrencyCode =
    currencies.find((c) => c.isBase === 1)?.code ?? currencies[0]?.code ?? '';
  const incomeMinor = await sumConvertedToBase(db, incomes, baseCurrencyCode);
  const totalPredictedMinor = await sumConvertedToBase(
    db,
    categoriesWithKinds.flatMap((c) =>
      c.kinds.map((k) => ({ amountMinor: k.predictedAmountMinor, currency: k.currency })),
    ),
    baseCurrencyCode,
  );

  const reviewedByKey = new Map(
    reviews.map((r) => [periodKey(r.year, r.month), r.reviewedAt] as const),
  );

  const periodKeys = new Set(
    allTransactions.map((tx) => {
      const { year, month } = getUtcYearMonth(tx.occurredAt);
      return periodKey(year, month);
    }),
  );

  const periods: PeriodReport[] = [];
  for (const key of periodKeys) {
    const [yearStr, monthStr] = key.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const { start, end } = getMonthRange(year, month);

    const periodTransactions = allTransactions.filter(
      (tx) => tx.occurredAt >= start && tx.occurredAt < end,
    );
    const periodJarTransactions = jarTransactions.filter(
      (tx) => tx.occurredAt >= start && tx.occurredAt < end,
    );

    const spentMinor = await sumConvertedToBase(db, periodTransactions, baseCurrencyCode);
    // `ledger_jar_transactions` has no `currency` column of its own (a
    // jar's currency lives on `ledger_saving_jars`); this table is always
    // empty until L.12 ships saving jars, so a plain unconverted sum is
    // correct today. Revisit with a proper per-jar currency join once real
    // jar transactions can exist.
    const netJarWithdrawalsMinor = periodJarTransactions
      .filter((tx) => tx.amountMinor < 0)
      .reduce((sum, tx) => sum + tx.amountMinor, 0);

    const spentByKindId = new Map<string, number>();
    for (const tx of periodTransactions) {
      spentByKindId.set(tx.kindId, (spentByKindId.get(tx.kindId) ?? 0) + tx.amountMinor);
    }

    const topCategories: ReportTopCategory[] = categoriesWithKinds
      .filter((category) => category.kinds.length > 0)
      .map((category) => {
        const predictedMinor = category.kinds.reduce((sum, k) => sum + k.predictedAmountMinor, 0);
        const actualMinor = category.kinds.reduce(
          (sum, k) => sum + (spentByKindId.get(k.id) ?? 0),
          0,
        );
        const variancePct =
          predictedMinor > 0 ? ((actualMinor - predictedMinor) / predictedMinor) * 100 : null;
        const varianceLabel =
          variancePct === null
            ? null
            : Math.abs(variancePct) < ON_BUDGET_THRESHOLD_PCT
              ? 'on budget'
              : `${variancePct > 0 ? '+' : ''}${Math.round(variancePct)}% vs. budget`;
        return {
          categoryId: category.id,
          name: category.name,
          actualMinor,
          predictedMinor,
          currency: category.kinds[0]?.currency ?? baseCurrencyCode,
          varianceLabel,
        };
      })
      .filter((c) => c.actualMinor > 0)
      .sort((a, b) => b.actualMinor - a.actualMinor)
      .slice(0, 5);

    const reviewedAt = reviewedByKey.get(key) ?? null;

    periods.push({
      year,
      month,
      incomeMinor,
      spentMinor,
      projectedSavingsMinor: incomeMinor - totalPredictedMinor,
      actualSavingsMinor: incomeMinor - spentMinor,
      actualSavingsNetOfJarsMinor: incomeMinor - spentMinor + netJarWithdrawalsMinor,
      reviewed: reviewedAt !== null,
      reviewedAt,
      topCategories,
    });
  }

  periods.sort((a, b) => (a.year !== b.year ? b.year - a.year : b.month - a.month));

  return { baseCurrencyCode, periods };
}
