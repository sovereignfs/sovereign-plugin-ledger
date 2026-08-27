import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../../_db/schema';
import { createTestDb, type TestDb } from '../../_db/__tests__/test-db';
import { getAccountsData, getNetWorthMinor } from '../accounts';

let t: TestDb;
const userId = 'user-1';
const tenantId = 'default';

beforeEach(async () => {
  t = await createTestDb();
});

afterEach(() => {
  t.close();
});

async function seedCurrency() {
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
}

describe('getNetWorthMinor', () => {
  it('is zero with no accounts/assets/deposits/loans at all', async () => {
    expect(await getNetWorthMinor(t.ledger, userId, 'EUR')).toBe(0);
  });

  it('sums bank/assets/deposits as assets, subtracts credit cards/loans as liabilities', async () => {
    const now = Date.now();
    await t.db.insert(schema.accounts).values([
      {
        id: 'acc-bank',
        tenantId,
        userId,
        name: 'Checking',
        institution: null,
        type: 'bank',
        balanceMinor: 200_000,
        currency: 'EUR',
        creditLimitMinor: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'acc-card',
        tenantId,
        userId,
        name: 'Card',
        institution: null,
        type: 'credit_card',
        balanceMinor: 30_000,
        currency: 'EUR',
        creditLimitMinor: 500_000,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await t.db.insert(schema.assets).values({
      id: 'asset-1',
      tenantId,
      userId,
      name: 'Gold',
      type: 'physical',
      valueMinor: 100_000,
      currency: 'EUR',
      createdAt: now,
      updatedAt: now,
    });
    await t.db.insert(schema.deposits).values({
      id: 'dep-1',
      tenantId,
      userId,
      name: 'Apartment',
      amountMinor: 300_000,
      currency: 'EUR',
      createdAt: now,
      updatedAt: now,
    });
    // A loan's `linkedKindId` is a real FK — needs an actual category+kind
    // row to reference, not just any string.
    await t.db.insert(schema.categories).values({
      id: 'cat-loans',
      tenantId,
      userId,
      name: 'Loans',
      type: 'fixed',
      createdAt: now,
      updatedAt: now,
    });
    await t.db.insert(schema.kinds).values({
      id: 'kind-car-loan',
      tenantId,
      userId,
      categoryId: 'cat-loans',
      name: 'Car loan',
      predictedAmountMinor: 18_000,
      currency: 'EUR',
      recurrenceIntervalUnit: null,
      recurrenceIntervalCount: null,
      recurrenceAnchorDate: null,
      createdAt: now,
      updatedAt: now,
    });
    await t.db.insert(schema.loans).values({
      id: 'loan-1',
      tenantId,
      userId,
      name: 'Car loan',
      lender: 'Bank',
      principalMinor: 1_000_000,
      remainingBalanceMinor: 420_000,
      installmentAmountMinor: 18_000,
      currency: 'EUR',
      startDate: '2025-01-01',
      endDate: '2027-12-01',
      linkedKindId: 'kind-car-loan',
      createdAt: now,
      updatedAt: now,
    });

    // assets: 200_000 + 100_000 + 300_000 = 600_000
    // liabilities: 30_000 + 420_000 = 450_000
    // net worth: 150_000
    expect(await getNetWorthMinor(t.ledger, userId, 'EUR')).toBe(150_000);
  });
});

describe('getAccountsData', () => {
  it('groups accounts by type and preloads each person\'s transaction history, sorted most recent first', async () => {
    await seedCurrency();
    const now = Date.now();
    await t.db.insert(schema.people).values({
      id: 'person-1',
      tenantId,
      userId,
      name: 'Alex',
      balanceMinor: 12_000,
      currency: 'EUR',
      createdAt: now,
      updatedAt: now,
    });
    await t.db.insert(schema.peopleTransactions).values([
      { id: 'ptx-1', tenantId, userId, personId: 'person-1', amountMinor: 18_000, note: null, occurredAt: now - 1000 },
      { id: 'ptx-2', tenantId, userId, personId: 'person-1', amountMinor: -6_000, note: 'Paid back', occurredAt: now },
    ]);

    const data = await getAccountsData(t.ledger, userId);
    expect(data.baseCurrencyCode).toBe('EUR');
    expect(data.netWorthMinor).toBe(0);
    expect(data.people).toHaveLength(1);
    expect(data.people[0]?.transactions.map((tx) => tx.id)).toEqual(['ptx-2', 'ptx-1']);
  });
});
