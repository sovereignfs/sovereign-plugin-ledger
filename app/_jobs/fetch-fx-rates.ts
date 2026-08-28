import type { ScheduleContext } from '@sovereignfs/sdk';
import { fxRates } from '../_db/schema';
import { CURRENCY_OPTIONS } from '../_lib/currency-options';
import { getDb } from '../_lib/db';
import { newId } from '../_lib/ids';

/**
 * The daily exchange-rate fetch (L.10) — manifest `schedules` entry,
 * `intervalMinutes: 1440`. Populates `ledger_fx_rates`, the untenanted,
 * instance-wide rate table every user's currency conversion reads from
 * (`fx-rates.ts`'s `getRateAsOf`).
 *
 * **Pivot is USD, not EUR** despite Frankfurter's own ECB data being
 * natively EUR-denominated — CONCEPT.md's design has fiat and crypto rates
 * sharing one table under one pivot, and a crypto source would default to
 * USD pricing (matching every major crypto API), so USD is the pivot both
 * kinds of source can share without a second conversion hop between them.
 *
 * **Fiat only, no crypto fetch, despite CONCEPT.md's "fiat and crypto
 * alike" framing.** No crypto currency is selectable anywhere in the app —
 * `CURRENCY_OPTIONS` (the fixed, complete set of currencies this instance
 * supports, per its own doc comment) is 20 fiat codes, nothing else.
 * Building a crypto fetch branch now would be dead code with no real
 * currency to exercise it. The schema already accommodates one later
 * (`source` is a free-text provenance column, not an enum) — this is a
 * scope cut, not an oversight, and should be revisited only once a task
 * actually adds a crypto currency option somewhere in the UI.
 *
 * **Two of the 20 `CURRENCY_OPTIONS` codes, LKR and AED, aren't in
 * Frankfurter's coverage at all** (confirmed against its own `/v1/currencies`
 * endpoint) — silently skipped below, not an error. A user on one of these
 * degrades to "no conversion available" via `getRateAsOf`'s own contract,
 * exactly like a brand-new currency this job hasn't run for yet.
 *
 * **`as_of_date` is Frankfurter's own returned `date`**, not this server's
 * local "today" — Frankfurter (ECB reference rates) returns the last
 * business day's date on a weekend/holiday, and storing that real reference
 * date (not the request date) is what makes `getRateAsOf`'s "most recent
 * rate on or before this date" lookup correct.
 *
 * **Idempotent via the DB, not an in-memory guard**: `onConflictDoNothing`
 * targets `ledger_fx_rates`' unique `(currency_code, pivot_code, as_of_date)`
 * index — re-running within the same day (the scheduler's interval is a
 * floor, a restart re-arms every schedule, and every replica in a
 * multi-node deployment ticks independently) inserts nothing a second time,
 * with no coordination between the job's own invocations required.
 */
const PIVOT_CODE = 'USD';

interface FrankfurterLatestResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

async function fetchFrankfurterRates(
  base: string,
  symbols: string[],
): Promise<FrankfurterLatestResponse> {
  const url = `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(base)}&symbols=${encodeURIComponent(symbols.join(','))}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Frankfurter request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as FrankfurterLatestResponse;
}

export default async function fetchFxRates(_ctx: ScheduleContext): Promise<void> {
  const symbols = CURRENCY_OPTIONS.map((c) => c.code).filter((code) => code !== PIVOT_CODE);
  const response = await fetchFrankfurterRates(PIVOT_CODE, symbols);

  // Frankfurter's `base=USD&symbols=...` returns "value of 1 USD in X" —
  // the inverse of what `ledger_fx_rates` stores ("value of 1 X in USD",
  // matching `sumConvertedToBase`'s `amountInX * rate = amountInPivot`).
  const rows = symbols
    .map((code) => {
      const usdPerUnit = response.rates[code];
      if (usdPerUnit === undefined) return null;
      return {
        id: newId(),
        currencyCode: code,
        pivotCode: PIVOT_CODE,
        rate: 1 / usdPerUnit,
        asOfDate: response.date,
        source: 'frankfurter',
      };
    })
    .filter((row) => row !== null);

  if (rows.length === 0) return;

  const db = await getDb();
  await db
    .insert(fxRates)
    .values(rows)
    .onConflictDoNothing({
      target: [fxRates.currencyCode, fxRates.pivotCode, fxRates.asOfDate],
    });
}
