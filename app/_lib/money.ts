import type { LedgerDb } from '../_db/client';
import { getRateAsOf } from '../_db/fx-rates';
import { todayDateOnly } from './period';

export interface CurrencyAmount {
  amountMinor: number;
  currency: string;
}

/**
 * Sums a list of amounts into one base-currency total, converting each
 * distinct non-base currency via `getRateAsOf` (today's rate — these are
 * "right now" dashboard totals, not historical reports, which would convert
 * at the transaction's own date instead). Every amount created through the
 * current UI is already in the base currency (the setup wizard only ever
 * writes incomes/categories/kinds in the currency the user just picked), so
 * this is a no-op sum in practice; the conversion path exists for when a
 * later task lets a kind/income diverge from the base currency, and no FX
 * rate job has run yet (L.10) — since `getRateAsOf` returns `null` when no
 * rate exists, an unconvertible currency's amount is excluded from the
 * total rather than guessed at, per that helper's own documented contract.
 */
export async function sumConvertedToBase(
  db: LedgerDb,
  amounts: CurrencyAmount[],
  baseCode: string,
): Promise<number> {
  const byCurrency = new Map<string, number>();
  for (const { amountMinor, currency } of amounts) {
    byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + amountMinor);
  }

  const asOfDate = todayDateOnly();
  let total = 0;
  for (const [currency, minor] of byCurrency) {
    if (currency === baseCode) {
      total += minor;
      continue;
    }
    const rate = await getRateAsOf(db, { currencyCode: currency, pivotCode: baseCode, asOfDate });
    if (rate === null) continue;
    total += Math.round(minor * rate);
  }
  return total;
}
