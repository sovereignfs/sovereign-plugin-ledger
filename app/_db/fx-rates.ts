import { and, desc, eq, inArray, lte } from 'drizzle-orm';
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

/**
 * An in-memory answer to "the cross-rate from X to Y as of this date",
 * pre-loaded in a single query.
 *
 * `getCrossRateAsOf` costs two `SELECT`s per call, and the conversion helpers
 * call it once per distinct (currency, date) pair. Because a historical amount
 * prices at its **own** date, Reports produces one such pair per transaction
 * *day* per currency, per period — a multi-currency user with a couple of
 * years of history was issuing well over a thousand sequential round-trips to
 * render one page, and the month-end job repeats that for every user on every
 * daily tick. Loading every stored rate for the currencies actually in play
 * turns all of it into one query.
 *
 * The rate table is small by construction: one row per supported currency per
 * day, for the twenty codes in `CURRENCY_OPTIONS`.
 */
export interface RateLookup {
  /** Same contract as `getCrossRateAsOf`: `null` when either leg has no rate as of that date. */
  crossRate(from: string, to: string, asOfDate: string): number | null;
}

export async function loadRateLookup(db: LedgerDb, codes: Iterable<string>): Promise<RateLookup> {
  const needed = [...new Set(codes)].filter((code) => code !== FX_PIVOT_CODE);
  const rows =
    needed.length === 0
      ? []
      : await db
          .select({
            currencyCode: fxRates.currencyCode,
            asOfDate: fxRates.asOfDate,
            rate: fxRates.rate,
          })
          .from(fxRates)
          .where(and(eq(fxRates.pivotCode, FX_PIVOT_CODE), inArray(fxRates.currencyCode, needed)));

  const byCode = new Map<string, Array<{ asOfDate: string; rate: number }>>();
  for (const row of rows) {
    const list = byCode.get(row.currencyCode) ?? [];
    list.push({ asOfDate: row.asOfDate, rate: row.rate });
    byCode.set(row.currencyCode, list);
  }
  // Newest first, so the common "as of today" lookup resolves on the first
  // entry. `as_of_date` is `YYYY-MM-DD`, so string order is date order.
  for (const list of byCode.values()) {
    list.sort((a, b) => (a.asOfDate < b.asOfDate ? 1 : a.asOfDate > b.asOfDate ? -1 : 0));
  }

  const rateAsOf = (code: string, asOfDate: string): number | null => {
    if (code === FX_PIVOT_CODE) return 1;
    const list = byCode.get(code);
    if (!list) return null;
    return list.find((entry) => entry.asOfDate <= asOfDate)?.rate ?? null;
  };

  return {
    crossRate(from, to, asOfDate) {
      if (from === to) return 1;
      const fromRate = rateAsOf(from, asOfDate);
      const toRate = rateAsOf(to, asOfDate);
      if (fromRate === null || toRate === null || toRate === 0) return null;
      return fromRate / toRate;
    },
  };
}
