import type { ScheduleContext } from '@sovereignfs/sdk';
import { currencies, fxRates } from '../_db/schema';
import { FX_PIVOT_CODE } from '../_lib/currency-options';
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
 * **Rates are fetched for the currencies users actually added, not for the
 * whole supported list.** `CURRENCY_OPTIONS` is now ICU's full ISO 4217 set
 * plus BTC — 163 codes — and storing a daily row for every one of them would
 * be a few hundred rows a day of which a typical instance reads three. The
 * wanted set is `SELECT DISTINCT code FROM ledger_currencies`: this table is
 * untenanted instance-wide reference data, so the union across every user is
 * exactly right, and a currency nobody has added needs no rate. A user who
 * adds one mid-day simply has no rate until the next run, which
 * `getRateAsOf`'s own contract already covers ("no conversion available",
 * surfaced via `ConvertedSum.unconvertedCurrencies`) — the same state a
 * brand-new instance is in before this job's first run.
 *
 * **Still no `symbols` filter on the request itself.** The wanted set now
 * decides what is *stored*, not what is *asked for*. Several supported codes
 * (LKR and AED among them, and every one ICU carries that Frankfurter does
 * not) aren't in Frankfurter's coverage, and naming them in a `symbols` list
 * means betting the whole request on how the upstream handles an unsupported
 * symbol — filter it out, or reject the request. If it rejects, this job
 * fails every single day and no rate is ever stored for *any* currency: a
 * total outage of every conversion in the app, caused by codes nobody can get
 * a rate for anyway. Asking for `base=USD` alone and keeping whatever comes
 * back that someone actually uses removes the question. The response is a few
 * dozen numbers, so there is nothing to save by filtering upstream.
 *
 * **BTC has no rate source here yet.** Frankfurter is ECB reference data —
 * fiat only, no crypto, by design. The schema has always accommodated a
 * second feed (`source` is a free-text provenance column, not an enum) and
 * the pivot was chosen as USD precisely so a crypto feed could share this
 * table without a second conversion hop. Until that feed exists, BTC is
 * selectable and recordable but not convertible, and degrades through the
 * same documented "no rate" path as any other uncovered currency rather than
 * being guessed at.
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
const PIVOT_CODE = FX_PIVOT_CODE;

interface FrankfurterLatestResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

async function fetchFrankfurterRates(base: string): Promise<FrankfurterLatestResponse> {
  const url = `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(base)}`;
  // Bounded like every other outbound fetch in this codebase — a hung
  // upstream must not pin the scheduler's slot for this plugin.
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    throw new Error(`Frankfurter request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as FrankfurterLatestResponse;
}

export default async function fetchFxRates(_ctx: ScheduleContext): Promise<void> {
  const db = await getDb();

  // Distinct across every user — see the "currencies users actually added"
  // note above for why the union is the right scope for an untenanted table.
  const inUse = await db.selectDistinct({ code: currencies.code }).from(currencies);
  const wanted = inUse.map((row) => row.code).filter((code) => code !== PIVOT_CODE);
  // Nothing to price on a fresh instance, or one where every user's only
  // currency is the pivot. Skipping the request entirely is the point of
  // asking the database first.
  if (wanted.length === 0) return;

  const response = await fetchFrankfurterRates(PIVOT_CODE);

  // Frankfurter's `base=USD` returns "value of 1 USD in X" — the inverse of
  // what `ledger_fx_rates` stores ("value of 1 X in USD", matching
  // `sumConvertedToBase`'s `amountInX * rate = amountInPivot`).
  const rows = wanted
    .map((code) => {
      const usdPerUnit = response.rates?.[code];
      // A zero or non-finite quote would invert to Infinity/NaN and poison
      // every conversion through this currency, so it is skipped like a
      // missing one rather than stored.
      if (typeof usdPerUnit !== 'number' || !Number.isFinite(usdPerUnit) || usdPerUnit <= 0) {
        return null;
      }
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

  await db
    .insert(fxRates)
    .values(rows)
    .onConflictDoNothing({
      target: [fxRates.currencyCode, fxRates.pivotCode, fxRates.asOfDate],
    });
}
