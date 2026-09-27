import type { LedgerDb } from '../_db/client';
import { loadRateLookup, type RateLookup } from '../_db/fx-rates';
import { todayDateOnly } from './period';

export interface CurrencyAmount {
  amountMinor: number;
  currency: string;
  /**
   * `YYYY-MM-DD` the conversion should be priced at — a transaction's own
   * date for historical reports (CONCEPT.md: "the rate in effect on each
   * transaction's own date"). Omitted for "right now" figures (dashboard
   * totals, balances), which convert at today's rate.
   */
  asOfDate?: string;
}

export interface ConvertedSum {
  totalMinor: number;
  /**
   * Distinct currency codes whose amounts could NOT be converted (no rate
   * as of the requested date) and were therefore left out of `totalMinor`.
   * Surfaces on screen as a "not included" note — a total that silently
   * shrank is worse than one that says why.
   */
  unconvertedCurrencies: string[];
}

/**
 * Sums a list of amounts into one base-currency total, converting each
 * distinct (currency, date) pair via `getCrossRateAsOf` — the cross-rate
 * derived from the two legs against the stored pivot, so a EUR-base user's
 * USD account converts just as well as a USD-base user's EUR one. An
 * unconvertible amount (no rate yet for either leg) is excluded from the
 * total and reported in `unconvertedCurrencies` rather than guessed at.
 */
export async function sumConvertedToBaseDetailed(
  db: LedgerDb,
  amounts: CurrencyAmount[],
  baseCode: string,
  lookup?: RateLookup,
): Promise<ConvertedSum> {
  const today = todayDateOnly();
  const byKey = new Map<string, { currency: string; asOfDate: string; minor: number }>();
  for (const { amountMinor, currency, asOfDate } of amounts) {
    const date = currency === baseCode ? today : (asOfDate ?? today);
    const key = `${currency}|${date}`;
    const entry = byKey.get(key) ?? { currency, asOfDate: date, minor: 0 };
    entry.minor += amountMinor;
    byKey.set(key, entry);
  }
  if (byKey.size === 0) return { totalMinor: 0, unconvertedCurrencies: [] };

  // One query for every rate this sum could need, unless a caller already
  // loaded one to share across several sums (`loadRateLookup`'s own doc
  // comment explains why the per-pair path was a real problem).
  const rates =
    lookup ??
    (await loadRateLookup(db, [baseCode, ...[...byKey.values()].map((entry) => entry.currency)]));

  let total = 0;
  const unconverted = new Set<string>();
  for (const { currency, asOfDate, minor } of byKey.values()) {
    if (currency === baseCode) {
      total += minor;
      continue;
    }
    const rate = rates.crossRate(currency, baseCode, asOfDate);
    if (rate === null) {
      unconverted.add(currency);
      continue;
    }
    total += Math.round(minor * rate);
  }
  return { totalMinor: total, unconvertedCurrencies: [...unconverted].sort() };
}

/** `sumConvertedToBaseDetailed` for callers that only need the number. */
export async function sumConvertedToBase(
  db: LedgerDb,
  amounts: CurrencyAmount[],
  baseCode: string,
  lookup?: RateLookup,
): Promise<number> {
  return (await sumConvertedToBaseDetailed(db, amounts, baseCode, lookup)).totalMinor;
}

/** Merges the `unconvertedCurrencies` of several sums into one sorted, distinct list. */
export function mergeUnconverted(
  ...sums: Array<Pick<ConvertedSum, 'unconvertedCurrencies'>>
): string[] {
  return [...new Set(sums.flatMap((s) => s.unconvertedCurrencies))].sort();
}
