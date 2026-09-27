import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getCrossRateAsOf, getRateAsOf, loadRateLookup } from '../fx-rates';
import { fxRates } from '../schema';
import { createTestDb, recordSql, type TestDb } from './test-db';

let t: TestDb;

beforeEach(async () => {
  t = await createTestDb();
});

afterEach(() => {
  t.close();
});

describe('getRateAsOf', () => {
  it('returns 1 for a currency against itself, without querying', async () => {
    // No rows inserted at all — if this queried, it would find nothing and
    // return null. Returning 1 proves the short-circuit fires.
    const rate = await getRateAsOf(t.ledger, {
      currencyCode: 'EUR',
      pivotCode: 'EUR',
      asOfDate: '2026-08-27',
    });
    expect(rate).toBe(1);
  });

  it('returns null when no rate exists yet for this currency', async () => {
    const rate = await getRateAsOf(t.ledger, {
      currencyCode: 'USD',
      pivotCode: 'EUR',
      asOfDate: '2026-08-27',
    });
    expect(rate).toBeNull();
  });

  it('picks the latest rate on or before the target date, ignoring later ones', async () => {
    await t.db.insert(fxRates).values([
      { id: 'r1', currencyCode: 'USD', pivotCode: 'EUR', rate: 0.9, asOfDate: '2026-08-01' },
      { id: 'r2', currencyCode: 'USD', pivotCode: 'EUR', rate: 0.91, asOfDate: '2026-08-15' },
      // Later than the target date below — must not be picked.
      { id: 'r3', currencyCode: 'USD', pivotCode: 'EUR', rate: 0.95, asOfDate: '2026-09-01' },
    ]);

    const rate = await getRateAsOf(t.ledger, {
      currencyCode: 'USD',
      pivotCode: 'EUR',
      asOfDate: '2026-08-20',
    });
    expect(rate).toBe(0.91);
  });

  it('returns null when every rate for this currency is after the target date', async () => {
    await t.db
      .insert(fxRates)
      .values([
        { id: 'r1', currencyCode: 'USD', pivotCode: 'EUR', rate: 0.95, asOfDate: '2026-09-01' },
      ]);

    const rate = await getRateAsOf(t.ledger, {
      currencyCode: 'USD',
      pivotCode: 'EUR',
      asOfDate: '2026-08-20',
    });
    expect(rate).toBeNull();
  });
});

describe('getCrossRateAsOf', () => {
  it('is 1 for a currency against itself', async () => {
    expect(
      await getCrossRateAsOf(t.ledger, { from: 'EUR', to: 'EUR', asOfDate: '2026-08-27' }),
    ).toBe(1);
  });

  it('derives from → to through the USD pivot', async () => {
    await t.db.insert(fxRates).values([
      { id: 'eur', currencyCode: 'EUR', pivotCode: 'USD', rate: 1.1, asOfDate: '2026-08-01' },
      { id: 'gbp', currencyCode: 'GBP', pivotCode: 'USD', rate: 1.25, asOfDate: '2026-08-01' },
    ]);
    const rate = await getCrossRateAsOf(t.ledger, {
      from: 'GBP',
      to: 'EUR',
      asOfDate: '2026-08-27',
    });
    expect(rate).toBeCloseTo(1.25 / 1.1, 10);
  });

  it('is null when either leg is missing', async () => {
    await t.db
      .insert(fxRates)
      .values([
        { id: 'eur', currencyCode: 'EUR', pivotCode: 'USD', rate: 1.1, asOfDate: '2026-08-01' },
      ]);
    expect(
      await getCrossRateAsOf(t.ledger, { from: 'GBP', to: 'EUR', asOfDate: '2026-08-27' }),
    ).toBeNull();
    expect(
      await getCrossRateAsOf(t.ledger, { from: 'EUR', to: 'GBP', asOfDate: '2026-08-27' }),
    ).toBeNull();
  });
});

describe('loadRateLookup', () => {
  it('answers as-of queries in memory with a single query, whatever the date spread', async () => {
    await t.db.insert(fxRates).values([
      { id: 'eur-jan', currencyCode: 'EUR', pivotCode: 'USD', rate: 1.1, asOfDate: '2026-01-01' },
      { id: 'eur-mar', currencyCode: 'EUR', pivotCode: 'USD', rate: 1.2, asOfDate: '2026-03-01' },
      {
        id: 'jpy-jan',
        currencyCode: 'JPY',
        pivotCode: 'USD',
        rate: 0.0067,
        asOfDate: '2026-01-01',
      },
    ]);

    const recorded = recordSql(t.client);

    const lookup = await loadRateLookup(t.ledger, ['EUR', 'JPY', 'USD']);
    recorded.stop();

    expect(recorded.calls.filter((sql) => sql.includes('ledger_fx_rates'))).toHaveLength(1);

    // The pivot leg is always 1, and a currency against itself is 1.
    expect(lookup.crossRate('USD', 'USD', '2026-06-01')).toBe(1);
    expect(lookup.crossRate('EUR', 'EUR', '2026-06-01')).toBe(1);
    // Latest rate on or before the date, per currency, not the newest overall.
    expect(lookup.crossRate('EUR', 'USD', '2026-02-01')).toBeCloseTo(1.1, 10);
    expect(lookup.crossRate('EUR', 'USD', '2026-06-01')).toBeCloseTo(1.2, 10);
    // Derived cross-rate through the pivot, same as `getCrossRateAsOf`.
    expect(lookup.crossRate('JPY', 'EUR', '2026-02-01')).toBeCloseTo(0.0067 / 1.1, 10);
    // No rate as of a date before any row exists.
    expect(lookup.crossRate('EUR', 'USD', '2025-12-31')).toBeNull();
    // A currency with no rows at all.
    expect(lookup.crossRate('GBP', 'USD', '2026-06-01')).toBeNull();
  });

  it('issues no query at all when only the pivot is needed', async () => {
    const recorded = recordSql(t.client);
    const lookup = await loadRateLookup(t.ledger, ['USD']);
    recorded.stop();

    expect(recorded.calls.filter((sql) => sql.includes('ledger_fx_rates'))).toHaveLength(0);
    expect(lookup.crossRate('USD', 'USD', '2026-06-01')).toBe(1);
  });
});
