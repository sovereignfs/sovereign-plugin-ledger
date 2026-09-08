import { and, desc, eq, lte } from 'drizzle-orm';
import type { LedgerDb } from './client';
import { FX_PIVOT_CODE } from '../_lib/currency-options';
import { fxRates } from './schema';

/**
 * The exchange rate in effect as of a given date — the most recent
 * `ledger_fx_rates` row for this currency pair with `as_of_date` on or
 * before the target date, per CONCEPT.md/SPEC.md: historical reports
 * convert using the rate that was actually in effect on the transaction's
 * own date, not the current rate.
 *
 * Returns `null` when no rate exists yet for this currency as of that date
 * (e.g. a brand-new currency the daily fetch job hasn't run for yet) —
 * callers degrade to "no conversion available," they never crash or
 * silently substitute a wrong rate.
 *
 * `currencyCode === pivotCode` always returns `1` without a query — the
 * pivot currency has no rate row against itself.
 */
export async function getRateAsOf(
  db: LedgerDb,
  params: { currencyCode: string; pivotCode: string; asOfDate: string },
): Promise<number | null> {
  if (params.currencyCode === params.pivotCode) return 1;

  const rows = await db
    .select({ rate: fxRates.rate })
    .from(fxRates)
    .where(
      and(
        eq(fxRates.currencyCode, params.currencyCode),
        eq(fxRates.pivotCode, params.pivotCode),
        lte(fxRates.asOfDate, params.asOfDate),
      ),
    )
    .orderBy(desc(fxRates.asOfDate))
    .limit(1);

  return rows[0]?.rate ?? null;
}

/**
 * The cross-rate from one currency to another, derived at query time from
 * each side's rate against the single stored pivot (`FX_PIVOT_CODE`) —
 * CONCEPT.md's "cross-rates are derived at query time" design. Every rate
 * row is "value of 1 unit of `currency_code` in the pivot," so
 * `amountInFrom × rate(from→pivot) ÷ rate(to→pivot)` is the amount in `to`.
 *
 * Returns `null` when either leg has no rate as of that date — same
 * degrade-don't-guess contract as `getRateAsOf`. Before this helper existed
 * the conversion path looked up `(currency, pivot = base currency)`
 * directly, which only ever matched when the base currency happened to be
 * the pivot itself.
 */
export async function getCrossRateAsOf(
  db: LedgerDb,
  params: { from: string; to: string; asOfDate: string },
): Promise<number | null> {
  if (params.from === params.to) return 1;
  const [fromRate, toRate] = await Promise.all([
    getRateAsOf(db, {
      currencyCode: params.from,
      pivotCode: FX_PIVOT_CODE,
      asOfDate: params.asOfDate,
    }),
    getRateAsOf(db, {
      currencyCode: params.to,
      pivotCode: FX_PIVOT_CODE,
      asOfDate: params.asOfDate,
    }),
  ]);
  if (fromRate === null || toRate === null || toRate === 0) return null;
  return fromRate / toRate;
}
