import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../../_db/schema';
import { createTestDb, type TestDb } from '../../_db/__tests__/test-db';
import { getBudgetData } from '../budget';

let t: TestDb;
const userId = 'user-1';
const tenantId = 'default';

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

async function seedBudget() {
  const now = Date.now();
  const twoMonthsAgo = now - 60 * 24 * 60 * 60 * 1000;

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
      note: 'Essen',
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

describe('getBudgetData', () => {
  it('groups categories into dynamic/fixed by their own type', async () => {
    await seedBudget();
    const data = await getBudgetData(t.ledger, userId);
    expect(data.dynamic.map((c) => c.name)).toEqual(['Groceries']);
    expect(data.fixed.map((c) => c.name)).toEqual(['Rent']);
  });

  it("sums a category's actual spend from this month only, but keeps older transactions in recent activity", async () => {
    await seedBudget();
    const data = await getBudgetData(t.ledger, userId);
    expect(data.dynamic).toHaveLength(1);
    const groceries = must(data.dynamic[0], 'groceries category');

    expect(groceries.predictedAmountMinor).toBe(15000);
    expect(groceries.actualAmountMinor).toBe(5000); // excludes tx-old
    expect(groceries.recentTransactions.map((tx) => tx.id)).toEqual(['tx-this-month', 'tx-old']);
  });

  it('reports zero actual for a category with no transactions at all', async () => {
    await seedBudget();
    const data = await getBudgetData(t.ledger, userId);
    expect(data.fixed).toHaveLength(1);
    const rent = must(data.fixed[0], 'rent category');
    expect(rent.actualAmountMinor).toBe(0);
    expect(rent.recentTransactions).toEqual([]);
  });

  it('returns empty dynamic/fixed lists when the user has no categories yet', async () => {
    const data = await getBudgetData(t.ledger, userId);
    expect(data).toEqual({ dynamic: [], fixed: [] });
  });
});
