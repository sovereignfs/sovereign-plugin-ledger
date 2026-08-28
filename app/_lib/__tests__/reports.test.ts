import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../../_db/schema';
import { createTestDb, type TestDb } from '../../_db/__tests__/test-db';
import { getReportsData } from '../reports';

let t: TestDb;
const userId = 'user-1';
const tenantId = 'default';

const JULY = Date.UTC(2026, 6, 15);
const AUGUST = Date.UTC(2026, 7, 10);

beforeEach(async () => {
  t = await createTestDb();
});

afterEach(() => {
  t.close();
});

/** Narrow a possibly-undefined value (noUncheckedIndexedAccess) with a hard failure. */
function must<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`expected ${label} to exist`);
  return value;
}

async function seedTwoMonths() {
  const now = Date.now();
  await t.db.insert(schema.currencies).values({
    id: 'cur-eur',
    tenantId,
    userId,
    code: 'EUR',
    isBase: 1,
    createdAt: now,
    updatedAt: now,
  });
  await t.db.insert(schema.incomes).values({
    id: 'inc-1',
    tenantId,
    userId,
    label: 'Primary',
    amountMinor: 400_000,
    currency: 'EUR',
    kind: 'primary',
    createdAt: now,
    updatedAt: now,
  });
  await t.db.insert(schema.categories).values([
    { id: 'cat-groceries', tenantId, userId, name: 'Groceries', type: 'dynamic', createdAt: now, updatedAt: now },
    { id: 'cat-rent', tenantId, userId, name: 'Rent', type: 'fixed', createdAt: now, updatedAt: now },
  ]);
  await t.db.insert(schema.kinds).values([
    {
      id: 'kind-groceries',
      tenantId,
      userId,
      categoryId: 'cat-groceries',
      name: 'Groceries',
      predictedAmountMinor: 15_000,
      currency: 'EUR',
      recurrenceIntervalUnit: null,
      recurrenceIntervalCount: null,
      recurrenceAnchorDate: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'kind-rent',
      tenantId,
      userId,
      categoryId: 'cat-rent',
      name: 'Rent',
      predictedAmountMinor: 170_000,
      currency: 'EUR',
      recurrenceIntervalUnit: null,
      recurrenceIntervalCount: null,
      recurrenceAnchorDate: null,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  // July: Groceries over budget (200.00 vs 150.00 predicted), Rent untouched.
  await t.db.insert(schema.transactions).values({
    id: 'tx-july-groceries',
    tenantId,
    userId,
    kindId: 'kind-groceries',
    amountMinor: 20_000,
    currency: 'EUR',
    occurredAt: JULY,
    note: null,
    createdAt: now,
    updatedAt: now,
  });
  // August: Groceries well under budget, Rent exactly on budget.
  await t.db.insert(schema.transactions).values([
    {
      id: 'tx-august-groceries',
      tenantId,
      userId,
      kindId: 'kind-groceries',
      amountMinor: 5_000,
      currency: 'EUR',
      occurredAt: AUGUST,
      note: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'tx-august-rent',
      tenantId,
      userId,
      kindId: 'kind-rent',
      amountMinor: 170_000,
      currency: 'EUR',
      occurredAt: AUGUST,
      note: null,
      createdAt: now,
      updatedAt: now,
    },
  ]);
}

describe('getReportsData', () => {
  it('lists one period per month with any activity, most recent first', async () => {
    await seedTwoMonths();
    const data = await getReportsData(t.ledger, userId);
    expect(data.periods.map((p) => `${p.year}-${p.month}`)).toEqual(['2026-8', '2026-7']);
  });

  it('computes the three savings figures correctly per period', async () => {
    await seedTwoMonths();
    const data = await getReportsData(t.ledger, userId);
    const july = must(
      data.periods.find((p) => p.year === 2026 && p.month === 7),
      'July',
    );

    // income 400_000, total predicted 15_000 + 170_000 = 185_000
    expect(july.projectedSavingsMinor).toBe(400_000 - 185_000);
    // July spent: 20_000
    expect(july.actualSavingsMinor).toBe(400_000 - 20_000);
    // No jar transactions can exist yet — always equal to actualSavingsMinor.
    expect(july.actualSavingsNetOfJarsMinor).toBe(july.actualSavingsMinor);

    const august = must(
      data.periods.find((p) => p.year === 2026 && p.month === 8),
      'August',
    );
    // August spent: 5_000 + 170_000 = 175_000
    expect(august.actualSavingsMinor).toBe(400_000 - 175_000);
    expect(august.projectedSavingsMinor).toBe(july.projectedSavingsMinor); // same current budget, no history
  });

  it('labels category variance against budget, filtering out untouched categories', async () => {
    await seedTwoMonths();
    const data = await getReportsData(t.ledger, userId);
    const july = must(
      data.periods.find((p) => p.month === 7),
      'July',
    );
    // Rent had zero spend in July — excluded entirely, not shown as €0.
    expect(july.topCategories.map((c) => c.name)).toEqual(['Groceries']);
    expect(july.topCategories[0]?.varianceLabel).toBe('+33% vs. budget');

    const august = must(
      data.periods.find((p) => p.month === 8),
      'August',
    );
    const rent = must(
      august.topCategories.find((c) => c.name === 'Rent'),
      'Rent',
    );
    expect(rent.varianceLabel).toBe('on budget');
    const groceries = must(
      august.topCategories.find((c) => c.name === 'Groceries'),
      'Groceries',
    );
    expect(groceries.varianceLabel).toBe('-67% vs. budget');
  });

  it('reflects ledger_period_reviews per period independently', async () => {
    await seedTwoMonths();
    const now = Date.now();
    await t.db.insert(schema.periodReviews).values({
      tenantId,
      userId,
      year: 2026,
      month: 7,
      reviewedAt: now,
    });
    const data = await getReportsData(t.ledger, userId);
    const july = must(
      data.periods.find((p) => p.month === 7),
      'July',
    );
    const august = must(
      data.periods.find((p) => p.month === 8),
      'August',
    );
    expect(july.reviewed).toBe(true);
    expect(august.reviewed).toBe(false);
  });

  it('returns no periods when the user has no transactions yet', async () => {
    const data = await getReportsData(t.ledger, userId);
    expect(data.periods).toEqual([]);
  });
});

describe('getReportsData — actual net of jars (L.12)', () => {
  it('a jar withdrawal reduces actualSavingsNetOfJarsMinor but not actualSavingsMinor', async () => {
    await seedTwoMonths();
    await t.db.insert(schema.savingJars).values({
      id: 'jar-travel',
      tenantId,
      userId,
      kindId: 'kind-groceries', // any existing kind id — jars aren't FK'd to a specific budget kind for this purpose
      balanceMinor: 20_000,
      currency: 'EUR',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    // A jar-funded expense in August: a withdrawal, never a ledger_transactions row.
    await t.db.insert(schema.jarTransactions).values({
      id: 'jartx-withdrawal',
      tenantId,
      userId,
      jarId: 'jar-travel',
      amountMinor: -3_000,
      categoryId: null,
      note: null,
      occurredAt: AUGUST,
    });

    const data = await getReportsData(t.ledger, userId);
    const august = must(
      data.periods.find((p) => p.year === 2026 && p.month === 8),
      'August',
    );
    // actualSavingsMinor is unaffected — the withdrawal was never a ledger_transactions row.
    expect(august.actualSavingsMinor).toBe(400_000 - 175_000);
    // actual-net-of-jars is reduced by exactly the withdrawal amount.
    expect(august.actualSavingsNetOfJarsMinor).toBe(august.actualSavingsMinor - 3_000);

    // July had no jar activity — untouched.
    const july = must(
      data.periods.find((p) => p.year === 2026 && p.month === 7),
      'July',
    );
    expect(july.actualSavingsNetOfJarsMinor).toBe(july.actualSavingsMinor);
  });

  it('a jar contribution does not affect actual-net-of-jars — only withdrawals do', async () => {
    await seedTwoMonths();
    await t.db.insert(schema.savingJars).values({
      id: 'jar-travel',
      tenantId,
      userId,
      kindId: 'kind-groceries',
      balanceMinor: 5_000,
      currency: 'EUR',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await t.db.insert(schema.jarTransactions).values({
      id: 'jartx-contribution',
      tenantId,
      userId,
      jarId: 'jar-travel',
      amountMinor: 5_000,
      categoryId: null,
      note: null,
      occurredAt: AUGUST,
    });

    const data = await getReportsData(t.ledger, userId);
    const august = must(
      data.periods.find((p) => p.year === 2026 && p.month === 8),
      'August',
    );
    expect(august.actualSavingsNetOfJarsMinor).toBe(august.actualSavingsMinor);
  });
});
