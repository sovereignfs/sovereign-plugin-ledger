import { eq } from 'drizzle-orm';
import type { LedgerDb } from '../_db/client';
import * as schema from '../_db/schema';
import { loadRateLookup } from '../_db/fx-rates';
import { mergeUnconverted, sumConvertedToBaseDetailed } from './money';
import {
  dateOnlyOf,
  getMonthRange,
  getUtcYearMonth,
  isCurrentMonth,
  todayDateOnly,
} from './period';
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
  /** True while this is the still-accumulating current UTC month — not
   *  review-eligible, and never the start of an over-budget streak. */
  isCurrent: boolean;
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
   * total household savings, only where it sits. Withdrawals are converted
   * from each jar's own currency at the withdrawal's date, like any other
   * historical amount.
   */
  actualSavingsNetOfJarsMinor: number;
  /** Currencies excluded from this period's totals for lack of a rate. */
  unconvertedCurrencies: string[];
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
 * Reports' one-round-trip payload — every period with any transaction or
 * jar-withdrawal activity, each fully detailed (same "preload everything,
 * no fetch-on-selection" choice as Budget/Accounts). Historical amounts
 * convert at their own date (`asOfDate`), per CONCEPT.md. A known
 * simplification, same shape as `predictedAmountMinor`'s own documented
 * non-effective-dating gap: income and budgeted amounts have no history,
 * so every period's "income"/"projected savings" reflects the user's
 * *current* declared income and budget, not what was actually true back
 * then.
 */
export async function getReportsData(
  db: LedgerDb,
  userId: string,
  now: number = Date.now(),
): Promise<ReportsData> {
  const [currencies, incomes, categoriesWithKinds, allTransactions, jarTransactions, reviews] =
    await Promise.all([
      db.select().from(schema.currencies).where(eq(schema.currencies.userId, userId)),
      db.select().from(schema.incomes).where(eq(schema.incomes.userId, userId)),
      listCategoriesWithKinds(db, userId),
      listTransactions(db, userId),
      db
        .select({
          amountMinor: schema.jarTransactions.amountMinor,
          occurredAt: schema.jarTransactions.occurredAt,
          currency: schema.savingJars.currency,
        })
        .from(schema.jarTransactions)
        .innerJoin(schema.savingJars, eq(schema.savingJars.id, schema.jarTransactions.jarId))
        .where(eq(schema.jarTransactions.userId, userId)),
      db.select().from(schema.periodReviews).where(eq(schema.periodReviews.userId, userId)),
    ]);

  const baseCurrencyCode =
    currencies.find((c) => c.isBase === 1)?.code ?? currencies[0]?.code ?? '';

  // One rate load for the whole payload. Historical amounts price at their own
  // date, so the per-pair path issued a query pair per (currency, transaction
  // day) — per period — which on a couple of years of multi-currency history
  // was over a thousand sequential round-trips to render one page, repeated
  // for every user on every tick of the month-end job.
  const rates = await loadRateLookup(db, [
    baseCurrencyCode,
    ...incomes.map((i) => i.currency),
    ...categoriesWithKinds.flatMap((c) => c.kinds.map((k) => k.currency)),
    ...allTransactions.map((tx) => tx.currency),
    ...jarTransactions.map((tx) => tx.currency),
  ]);

  const incomeSum = await sumConvertedToBaseDetailed(db, incomes, baseCurrencyCode, rates);
  const predictedSum = await sumConvertedToBaseDetailed(
    db,
    categoriesWithKinds.flatMap((c) =>
      c.kinds.map((k) => ({ amountMinor: k.predictedAmountMinor, currency: k.currency })),
    ),
    baseCurrencyCode,
    rates,
  );
  const incomeMinor = incomeSum.totalMinor;
  const totalPredictedMinor = predictedSum.totalMinor;

  const reviewedByKey = new Map(
    reviews.map((r) => [periodKey(r.year, r.month), r.reviewedAt] as const),
  );

  const jarWithdrawals = jarTransactions.filter((tx) => tx.amountMinor < 0);
  const periodKeys = new Set(
    [...allTransactions, ...jarWithdrawals].map((tx) => {
      const { year, month } = getUtcYearMonth(tx.occurredAt);
      return periodKey(year, month);
    }),
  );

  const today = todayDateOnly(now);
  const sortKeyFor = (amountMinor: number, code: string): number => {
    if (code === baseCurrencyCode) return amountMinor;
    const rate = rates.crossRate(code, baseCurrencyCode, today);
    return rate === null ? -1 : Math.round(amountMinor * rate);
  };

  const periods: PeriodReport[] = [];
  for (const key of periodKeys) {
    const [yearStr, monthStr] = key.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const { start, end } = getMonthRange(year, month);

    const periodTransactions = allTransactions.filter(
      (tx) => tx.occurredAt >= start && tx.occurredAt < end,
    );
    const periodJarWithdrawals = jarWithdrawals.filter(
      (tx) => tx.occurredAt >= start && tx.occurredAt < end,
    );

    const spentSum = await sumConvertedToBaseDetailed(
      db,
      periodTransactions.map((tx) => ({
        amountMinor: tx.amountMinor,
        currency: tx.currency,
        asOfDate: dateOnlyOf(tx.occurredAt),
      })),
      baseCurrencyCode,
      rates,
    );
    // Withdrawals are stored negative, so this sum is ≤ 0 and *adding* it
    // to actual savings is what nets jar-funded spending out.
    const withdrawalsSum = await sumConvertedToBaseDetailed(
      db,
      periodJarWithdrawals.map((tx) => ({
        amountMinor: tx.amountMinor,
        currency: tx.currency,
        asOfDate: dateOnlyOf(tx.occurredAt),
      })),
      baseCurrencyCode,
      rates,
    );
    const spentMinor = spentSum.totalMinor;

    const spentByKindId = new Map<string, number>();
    for (const tx of periodTransactions) {
      spentByKindId.set(tx.kindId, (spentByKindId.get(tx.kindId) ?? 0) + tx.amountMinor);
    }

    const topCategories: ReportTopCategory[] = [];
    for (const category of categoriesWithKinds) {
      if (category.kinds.length === 0) continue;
      // Per-category figures are shown in the category's own currency
      // (every kind in a category shares one — enforced by `createKind`),
      // so no conversion is needed here; only the period totals above are
      // in the base currency.
      const currency = category.kinds[0]?.currency ?? baseCurrencyCode;
      const predictedMinor = category.kinds.reduce((sum, k) => sum + k.predictedAmountMinor, 0);
      const actualMinor = category.kinds.reduce(
        (sum, k) => sum + (spentByKindId.get(k.id) ?? 0),
        0,
      );
      if (actualMinor <= 0) continue;
      const variancePct =
        predictedMinor > 0 ? ((actualMinor - predictedMinor) / predictedMinor) * 100 : null;
      const varianceLabel =
        variancePct === null
          ? null
          : Math.abs(variancePct) < ON_BUDGET_THRESHOLD_PCT
            ? 'on budget'
            : `${variancePct > 0 ? '+' : ''}${Math.round(variancePct)}% vs. budget`;
      topCategories.push({
        categoryId: category.id,
        name: category.name,
        actualMinor,
        predictedMinor,
        currency,
        varianceLabel,
      });
    }
    // Ordered on the base-currency value, not the raw stored integers: this is
    // "the biggest spends this period", and 50_000 minor units of one currency
    // is not more than 50_000 of another. A category whose rate is missing
    // sorts last rather than being ranked as if it were tiny.
    topCategories
      .sort((a, b) => sortKeyFor(b.actualMinor, b.currency) - sortKeyFor(a.actualMinor, a.currency))
      .splice(5);

    const reviewedAt = reviewedByKey.get(key) ?? null;

    periods.push({
      year,
      month,
      isCurrent: isCurrentMonth(year, month, now),
      incomeMinor,
      spentMinor,
      projectedSavingsMinor: incomeMinor - totalPredictedMinor,
      actualSavingsMinor: incomeMinor - spentMinor,
      actualSavingsNetOfJarsMinor: incomeMinor - spentMinor + withdrawalsSum.totalMinor,
      unconvertedCurrencies: mergeUnconverted(incomeSum, predictedSum, spentSum, withdrawalsSum),
      reviewed: reviewedAt !== null,
      reviewedAt,
      topCategories,
    });
  }

  periods.sort((a, b) => (a.year !== b.year ? b.year - a.year : b.month - a.month));

  return { baseCurrencyCode, periods };
}
