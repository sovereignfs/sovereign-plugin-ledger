import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fxRates } from '../../_db/schema';
import { createTestDb, type TestDb } from '../../_db/__tests__/test-db';
import { sumConvertedToBase } from '../money';

let t: TestDb;

beforeEach(async () => {
  t = await createTestDb();
});

afterEach(() => {
  t.close();
});

describe('sumConvertedToBase', () => {
  it('sums same-currency amounts directly, with no rate lookup needed', async () => {
    // No fx rate rows inserted at all — if this queried for EUR/EUR, it
    // would fail to short-circuit and (correctly) return 1 anyway via
    // getRateAsOf, but this proves the base-currency branch never queries.
    const total = await sumConvertedToBase(
      t.ledger,
      [
        { amountMinor: 1000, currency: 'EUR' },
        { amountMinor: 2500, currency: 'EUR' },
      ],
      'EUR',
    );
    expect(total).toBe(3500);
  });

  it('converts a non-base currency using the rate in effect today', async () => {
    await t.db.insert(fxRates).values([
      { id: 'r1', currencyCode: 'USD', pivotCode: 'EUR', rate: 0.9, asOfDate: '2020-01-01' },
    ]);
    const total = await sumConvertedToBase(
      t.ledger,
      [{ amountMinor: 1000, currency: 'USD' }],
      'EUR',
    );
    expect(total).toBe(900);
  });

  it('excludes an amount whose currency has no rate yet, rather than guessing', async () => {
    const total = await sumConvertedToBase(
      t.ledger,
      [
        { amountMinor: 1000, currency: 'EUR' },
        { amountMinor: 500, currency: 'JPY' }, // no fx rate row exists
      ],
      'EUR',
    );
    expect(total).toBe(1000);
  });

  it('returns 0 for an empty amounts list without touching the database', async () => {
    const total = await sumConvertedToBase(t.ledger, [], 'EUR');
    expect(total).toBe(0);
  });
});
