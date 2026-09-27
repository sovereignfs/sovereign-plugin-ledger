import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../../_db/schema';
import { createTestDb, type TestDb } from '../../_db/__tests__/test-db';
import { getOverviewData } from '../overview';

let t: TestDb;
const userId = 'user-1';
const tenantId = 'default';

beforeEach(async () => {
  t = await createTestDb();
});

afterEach(() => {
  t.close();
});

async function seedBudget() {
  const now = Date.now();
  const twoMonthsAgo = now - 60 * 24 * 60 * 60 * 1000;

  await t.db.insert(schema.currencies).values({
    id: 'cur-eur',
    tenantId,
    userId,
    code: 'EUR',
    isBase: 1,
    createdAt: now,
    updatedAt: now,
  });
  await t.db.insert(schema.incomes).values([
    {
      id: 'inc-1',
      tenantId,
      userId,
      label: 'Primary income',
      amountMinor: 400000,
      currency: 'EUR',
      kind: 'primary',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'inc-2',
      tenantId,
      userId,
      label: 'Freelance',
      amountMinor: 50000,
      currency: 'EUR',
      kind: 'secondary',
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await t.db.insert(schema.categories).values([
    {
      id: 'cat-groceries',
      tenantId,
      userId,
      name: 'Groceries',
      type: 'dynamic',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'cat-rent',
      tenantId,
      userId,
      name: 'Rent',
      type: 'fixed',
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await t.db.insert(schema.kinds).values([
    {
      id: 'kind-groceries',
      tenantId,
      userId,
      categoryId: 'cat-groceries',
      name: 'Groceries',
      predictedAmountMinor: 15000,
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
      predictedAmountMinor: 170000,
      currency: 'EUR',
      recurrenceIntervalUnit: null,
      recurrenceIntervalCount: null,
      recurrenceAnchorDate: null,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await t.db.insert(schema.transactions).values([
    {
      id: 'tx-this-month',
      tenantId,
      userId,
      kindId: 'kind-groceries',
      amountMinor: 5000,
      currency: 'EUR',
      occurredAt: now,
      note: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'tx-old',
      tenantId,
      userId,
      kindId: 'kind-groceries',
      amountMinor: 9999,
      currency: 'EUR',
      occurredAt: twoMonthsAgo,
      note: null,
      createdAt: twoMonthsAgo,
      updatedAt: twoMonthsAgo,
    },
  ]);
}

describe('getOverviewData', () => {
  it('aggregates this-month income/spend, ignoring transactions outside the current month', async () => {
    await seedBudget();
    const data = await getOverviewData(t.ledger, userId);

    expect(data.baseCurrencyCode).toBe('EUR');
    expect(data.transactionCount).toBe(2);
    expect(data.thisMonth.incomeMinor).toBe(450000);
    expect(data.thisMonth.spentMinor).toBe(5000);
    // Projected = income − everything budgeted (15_000 + 170_000), the same
    // definition Reports uses; remaining = income − spent so far.
    expect(data.thisMonth.budgetedMinor).toBe(185000);
    expect(data.thisMonth.projectedSavingsMinor).toBe(265000);
    expect(data.thisMonth.remainingMinor).toBe(445000);
  });

  it('reports zero net worth and saving jars when no accounts/jars exist yet', async () => {
    await seedBudget();
    const data = await getOverviewData(t.ledger, userId);
    expect(data.netWorth.totalMinor).toBe(0);
    expect(data.savingJars).toEqual({ totalMinor: 0, jarCount: 0 });
  });

  it('ranks top categories by predicted amount, with actuals scoped to this month only', async () => {
    await seedBudget();
    const data = await getOverviewData(t.ledger, userId);

    expect(data.topCategories.map((c) => c.name)).toEqual(['Rent', 'Groceries']);
    const groceries = data.topCategories.find((c) => c.name === 'Groceries');
    expect(groceries?.predictedAmountMinor).toBe(15000);
    expect(groceries?.actualAmountMinor).toBe(5000); // excludes tx-old
    const rent = data.topCategories.find((c) => c.name === 'Rent');
    expect(rent?.actualAmountMinor).toBe(0);
  });

  it('reflects real income/category counts in the checklist rows', async () => {
    await seedBudget();
    const data = await getOverviewData(t.ledger, userId);

    const currencyRow = data.checklist.find((c) => c.key === 'currency-incomes');
    expect(currencyRow?.done).toBe(true);
    expect(currencyRow?.detail).toBe('EUR • Primary + 1 secondary');

    const categoriesRow = data.checklist.find((c) => c.key === 'expense-categories');
    expect(categoriesRow?.done).toBe(true);
    expect(categoriesRow?.detail).toBe('1 dynamic, 1 fixed');

    const pendingRow = data.checklist.find((c) => c.key === 'bank-accounts');
    expect(pendingRow?.done).toBe(false);
    expect(pendingRow?.comingSoon).toBe(false);
    expect(pendingRow?.href).toBe('/ledger/accounts');

    const savingRow = data.checklist.find((c) => c.key === 'saving-plans');
    expect(savingRow).toMatchObject({ done: false, comingSoon: false, href: '/ledger/budget' });
  });

  it('marks saving-plans done once a saving jar exists (L.12 shipped)', async () => {
    await seedBudget();
    const now = Date.now();
    await t.db.insert(schema.categories).values({
      id: 'cat-travel',
      tenantId,
      userId,
      name: 'Travel jar',
      type: 'saving',
      createdAt: now,
      updatedAt: now,
    });
    await t.db.insert(schema.kinds).values({
      id: 'kind-travel',
      tenantId,
      userId,
      categoryId: 'cat-travel',
      name: 'Travel jar',
      predictedAmountMinor: 10_000,
      currency: 'EUR',
      recurrenceIntervalUnit: null,
      recurrenceIntervalCount: null,
      recurrenceAnchorDate: null,
      createdAt: now,
      updatedAt: now,
    });
    await t.db.insert(schema.savingJars).values({
      id: 'jar-travel',
      tenantId,
      userId,
      kindId: 'kind-travel',
      balanceMinor: 0,
      currency: 'EUR',
      createdAt: now,
      updatedAt: now,
    });

    const data = await getOverviewData(t.ledger, userId);
    const savingRow = data.checklist.find((c) => c.key === 'saving-plans');
    expect(savingRow).toMatchObject({
      done: true,
      comingSoon: false,
      detail: '1 jar',
      href: undefined,
    });
  });

  it('excludes a zero-kind category (e.g. an empty shared "Loans" category) from top categories', async () => {
    await seedBudget();
    const now = Date.now();
    await t.db.insert(schema.categories).values({
      id: 'cat-empty-loans',
      tenantId,
      userId,
      name: 'Loans',
      type: 'fixed',
      createdAt: now,
      updatedAt: now,
    });
    const data = await getOverviewData(t.ledger, userId);
    expect(data.topCategories.map((c) => c.name)).not.toContain('Loans');
  });
});

describe('getOverviewData — recent activity window and currency-aware ordering', () => {
  const now = Date.UTC(2026, 5, 3, 12); // 3 June 2026, early in the month

  async function seedTwoCurrencyBudget() {
    const base = { tenantId, userId, createdAt: now, updatedAt: now };
    await t.db.insert(schema.currencies).values([
      { id: 'cur-eur', code: 'EUR', isBase: 1, ...base },
      { id: 'cur-jpy', code: 'JPY', isBase: 0, ...base },
    ]);
    await t.db.insert(schema.categories).values([
      { id: 'cat-eur', name: 'Rent', type: 'fixed', ...base },
      { id: 'cat-jpy', name: 'Tokyo trip', type: 'dynamic', ...base },
    ]);
    await t.db.insert(schema.kinds).values([
      {
        id: 'kind-eur',
        categoryId: 'cat-eur',
        name: 'Rent',
        predictedAmountMinor: 100_000, // €1,000.00
        currency: 'EUR',
        recurrenceIntervalUnit: null,
        recurrenceIntervalCount: null,
        recurrenceAnchorDate: null,
        ...base,
      },
      {
        id: 'kind-jpy',
        categoryId: 'cat-jpy',
        name: 'Tokyo trip',
        predictedAmountMinor: 500_000, // a bigger integer, a smaller real amount
        currency: 'JPY',
        recurrenceIntervalUnit: null,
        recurrenceIntervalCount: null,
        recurrenceAnchorDate: null,
        ...base,
      },
    ]);
    // 1 EUR = 1.10 USD, 1 JPY = 0.0067 USD.
    await t.db.insert(schema.fxRates).values([
      {
        id: 'r-eur',
        currencyCode: 'EUR',
        pivotCode: 'USD',
        rate: 1.1,
        asOfDate: '2026-01-01',
        source: 'test',
      },
      {
        id: 'r-jpy',
        currencyCode: 'JPY',
        pivotCode: 'USD',
        rate: 0.0067,
        asOfDate: '2026-01-01',
        source: 'test',
      },
    ]);
  }

  it('shows activity from before this month rather than emptying on the 1st', async () => {
    await seedTwoCurrencyBudget();
    const lastMonth = Date.UTC(2026, 4, 28, 12); // 28 May 2026
    await t.db.insert(schema.transactions).values({
      id: 'tx-last-month',
      tenantId,
      userId,
      kindId: 'kind-eur',
      amountMinor: 5_000,
      currency: 'EUR',
      occurredAt: lastMonth,
      note: 'Late May',
      createdAt: lastMonth,
      updatedAt: lastMonth,
    });

    const data = await getOverviewData(t.ledger, userId, now);
    // "Recent" is a rolling window: this used to read empty for the first days
    // of every month however much was logged just before it.
    expect(data.recentActivity.map((i) => i.id)).toEqual(['tx-last-month']);
    // ...while "this month" totals stay scoped to the month.
    expect(data.thisMonth.spentMinor).toBe(0);
  });

  it('ranks top categories by their base-currency value, not their raw integers', async () => {
    await seedTwoCurrencyBudget();
    const data = await getOverviewData(t.ledger, userId, now);
    // JPY's stored integer is the larger of the two (500_000 vs 100_000) but
    // it is worth far less: ¥5,000 ≈ €30 against €1,000.
    expect(data.topCategories.map((c) => c.categoryId)).toEqual(['cat-eur', 'cat-jpy']);
  });

  it('prices this month’s spend at each expense’s own date, as Reports does', async () => {
    await seedTwoCurrencyBudget();
    // A later, different rate. Converting at "today" would use this one for an
    // expense that happened while the earlier rate was in effect.
    await t.db.insert(schema.fxRates).values({
      id: 'r-jpy-later',
      currencyCode: 'JPY',
      pivotCode: 'USD',
      rate: 0.02,
      asOfDate: '2026-06-02',
      source: 'test',
    });
    const spentAt = Date.UTC(2026, 5, 1, 12); // 1 June, before the new rate
    await t.db.insert(schema.transactions).values({
      id: 'tx-jpy',
      tenantId,
      userId,
      kindId: 'kind-jpy',
      amountMinor: 100_000,
      currency: 'JPY',
      occurredAt: spentAt,
      note: null,
      createdAt: spentAt,
      updatedAt: spentAt,
    });

    const data = await getOverviewData(t.ledger, userId, now);
    // 100_000 JPY minor × (0.0067 / 1.1) = 609, the 1 June rate.
    // The 2 June rate would have given 1_818.
    expect(data.thisMonth.spentMinor).toBe(609);
  });
});
