import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fxRates } from '../../_db/schema';
import { createTestDb, type TestDb } from '../../_db/__tests__/test-db';
import { sumConvertedToBase, sumConvertedToBaseDetailed } from '../money';

let t: TestDb;

beforeEach(async () => {
  t = await createTestDb();
});

afterEach(() => {
  t.close();
});

/** Every stored rate is "USD per 1 unit of `currencyCode`" against the USD pivot. */
async function seedPivotRates(rates: Array<[code: string, usdPerUnit: number, asOfDate?: string]>) {
  await t.db.insert(fxRates).values(
    rates.map(([currencyCode, rate, asOfDate], i) => ({
      id: `r${i}-${currencyCode}-${asOfDate ?? 'x'}`,
      currencyCode,
      pivotCode: 'USD',
      rate,
      asOfDate: asOfDate ?? '2020-01-01',
    })),
  );
}

describe('sumConvertedToBase', () => {
  it('sums same-currency amounts directly, with no rate lookup needed', async () => {
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

  it('converts into a USD base straight off the pivot rate', async () => {
    await seedPivotRates([['EUR', 1.1]]);
    const total = await sumConvertedToBase(
      t.ledger,
      [{ amountMinor: 1000, currency: 'EUR' }],
      'USD',
    );
    expect(total).toBe(1100);
  });

  it('derives a cross-rate for a non-USD base from both legs against the pivot', async () => {
    // 1 EUR = 1.10 USD, 1 GBP = 1.25 USD → 1 GBP = 1.25 / 1.10 EUR.
    await seedPivotRates([
      ['EUR', 1.1],
      ['GBP', 1.25],
    ]);
    const total = await sumConvertedToBase(
      t.ledger,
      [{ amountMinor: 1000, currency: 'GBP' }],
      'EUR',
    );
    expect(total).toBe(Math.round(1000 * (1.25 / 1.1)));
  });

  it('converts USD amounts into a non-USD base (the pivot leg is 1)', async () => {
    await seedPivotRates([['EUR', 1.25]]);
    const total = await sumConvertedToBase(
      t.ledger,
      [{ amountMinor: 1000, currency: 'USD' }],
      'EUR',
    );
    expect(total).toBe(800);
  });

  it('prices a historical amount at its own date, not today', async () => {
    await seedPivotRates([
      ['EUR', 1.0, '2026-01-01'],
      ['EUR', 2.0, '2026-06-01'],
    ]);
    const total = await sumConvertedToBase(
      t.ledger,
      [
        { amountMinor: 1000, currency: 'EUR', asOfDate: '2026-03-15' },
        { amountMinor: 1000, currency: 'EUR', asOfDate: '2026-07-15' },
      ],
      'USD',
    );
    expect(total).toBe(1000 + 2000);
  });

  it('excludes an amount whose currency has no rate yet and reports it, rather than guessing', async () => {
    const result = await sumConvertedToBaseDetailed(
      t.ledger,
      [
        { amountMinor: 1000, currency: 'EUR' },
        { amountMinor: 500, currency: 'JPY' }, // no fx rate row exists
      ],
      'EUR',
    );
    expect(result.totalMinor).toBe(1000);
    expect(result.unconvertedCurrencies).toEqual(['JPY']);
  });

  it('excludes everything when the base currency itself has no pivot rate yet', async () => {
    await seedPivotRates([['GBP', 1.25]]);
    const result = await sumConvertedToBaseDetailed(
      t.ledger,
      [{ amountMinor: 1000, currency: 'GBP' }],
      'LKR',
    );
    expect(result.totalMinor).toBe(0);
    expect(result.unconvertedCurrencies).toEqual(['GBP']);
  });

  it('returns 0 for an empty amounts list without touching the database', async () => {
    const total = await sumConvertedToBase(t.ledger, [], 'EUR');
    expect(total).toBe(0);
  });
});
