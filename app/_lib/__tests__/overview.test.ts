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
    expect(data.thisMonth.projectedSavedMinor).toBe(445000);
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
    expect(savingRow?.comingSoon).toBe(true);
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
