/**
 * L.13 review checklist: rules produce zero false positives against a
 * single month of seeded data (nothing to compare against yet); a second
 * seeded month with a deliberately over-budget category produces exactly
 * the expected tip — both covered directly against `getInsights` at the
 * bottom of this file, on top of the pure-function unit tests for each
 * rule above it.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../../_db/schema';
import { createTestDb, type TestDb } from '../../_db/__tests__/test-db';
import {
  computeLargeTransactionInsights,
  computeOverBudgetStreakInsights,
  getInsights,
  type InsightTransaction,
} from '../insights';
import type { PeriodReport, ReportTopCategory } from '../reports';

function category(
  categoryId: string,
  name: string,
  actualMinor: number,
  predictedMinor: number,
): ReportTopCategory {
  return { categoryId, name, actualMinor, predictedMinor, currency: 'EUR', varianceLabel: null };
}

/** Most-recent-first by construction — callers pass periods newest first,
 *  matching `getReportsData`'s own documented ordering contract. */
function period(
  year: number,
  month: number,
  topCategories: ReportTopCategory[],
  isCurrent = false,
): PeriodReport {
  return {
    year,
    month,
    isCurrent,
    unconvertedCurrencies: [],
    incomeMinor: 0,
    spentMinor: 0,
    projectedSavingsMinor: 0,
    actualSavingsMinor: 0,
    actualSavingsNetOfJarsMinor: 0,
    reviewed: false,
    reviewedAt: null,
    topCategories,
  };
}

describe('computeOverBudgetStreakInsights', () => {
  it('produces no insight from a single over-budget period (below the 2-month threshold)', () => {
    const periods = [period(2026, 8, [category('cat-1', 'Eating out', 200, 150)])];
    expect(computeOverBudgetStreakInsights(periods)).toEqual([]);
  });

  it('flags a category over budget for exactly 2 consecutive months', () => {
    const periods = [
      period(2026, 8, [category('cat-1', 'Eating out', 200, 150)]),
      period(2026, 7, [category('cat-1', 'Eating out', 180, 150)]),
    ];
    expect(computeOverBudgetStreakInsights(periods)).toEqual([
      'Eating out has run over budget 2 months running.',
    ]);
  });

  it("states the real streak length — 3 months reproduces the wireframe's own example text", () => {
    const periods = [
      period(2026, 9, [category('cat-1', 'Eating out', 200, 150)]),
      period(2026, 8, [category('cat-1', 'Eating out', 180, 150)]),
      period(2026, 7, [category('cat-1', 'Eating out', 160, 150)]),
    ];
    expect(computeOverBudgetStreakInsights(periods)).toEqual([
      'Eating out has run over budget 3 months running.',
    ]);
  });

  it('breaks the streak once the most recent month is not over budget', () => {
    const periods = [
      period(2026, 8, [category('cat-1', 'Eating out', 100, 150)]), // under budget now
      period(2026, 7, [category('cat-1', 'Eating out', 200, 150)]),
    ];
    expect(computeOverBudgetStreakInsights(periods)).toEqual([]);
  });

  it('breaks the streak when a category has zero spend (absent from topCategories) in an older month', () => {
    const periods = [
      period(2026, 8, [category('cat-1', 'Eating out', 200, 150)]),
      period(2026, 7, []), // no spend at all that month — not "over budget"
      period(2026, 6, [category('cat-1', 'Eating out', 200, 150)]),
    ];
    expect(computeOverBudgetStreakInsights(periods)).toEqual([]);
  });

  it('ignores a category with no budget to compare against (predictedMinor 0)', () => {
    const periods = [
      period(2026, 8, [category('cat-1', 'Eating out', 200, 0)]),
      period(2026, 7, [category('cat-1', 'Eating out', 200, 0)]),
    ];
    expect(computeOverBudgetStreakInsights([...periods])).toEqual([]);
  });

  it('returns nothing for an empty period list', () => {
    expect(computeOverBudgetStreakInsights([])).toEqual([]);
  });

  it('skips the in-progress current month and counts the streak from the last completed one', () => {
    // Nothing spent yet this month (category absent from the current
    // period) — that must not break a streak built over the two completed
    // months before it.
    const periods = [
      period(2026, 9, [], true),
      period(2026, 8, [category('c1', 'Eating out', 20_000, 15_000)]),
      period(2026, 7, [category('c1', 'Eating out', 18_000, 15_000)]),
    ];
    expect(computeOverBudgetStreakInsights(periods)).toEqual([
      'Eating out has run over budget 2 months running.',
    ]);
  });
});

describe('computeLargeTransactionInsights', () => {
  const kindNames = new Map([['kind-1', 'Groceries']]);

  // `occurredAt` is a small sequence number here; the rule only looks at
  // ordering and recency, so `now` is pinned just after the newest one.
  const NOW = 10;

  function tx(amountMinor: number, occurredAt: number): InsightTransaction {
    return { kindId: 'kind-1', amountMinor, occurredAt, currency: 'EUR' };
  }

  it('produces no insight with fewer than 4 total transactions (no baseline yet)', () => {
    const transactions = [tx(1000, 3), tx(1000, 2), tx(1000, 1)];
    expect(computeLargeTransactionInsights(transactions, kindNames, NOW)).toEqual([]);
  });

  it('produces no insight when the latest transaction is close to typical', () => {
    const transactions = [tx(1100, 4), tx(1000, 3), tx(1000, 2), tx(1000, 1)];
    expect(computeLargeTransactionInsights(transactions, kindNames, NOW)).toEqual([]);
  });

  it('flags the latest transaction when it is at least 2x the average of prior ones', () => {
    const transactions = [tx(3000, 4), tx(1000, 3), tx(1000, 2), tx(1000, 1)];
    expect(computeLargeTransactionInsights(transactions, kindNames, NOW)).toEqual([
      'Your latest Groceries expense of €30.00 is unusually large compared to your typical €10.00.',
    ]);
  });

  it('only evaluates the single most recent transaction, not every historical spike', () => {
    // An old spike (tx at occurredAt=2) is 3x its own prior average, but it's
    // not the latest — only occurredAt=5 (in line with typical) is checked.
    const transactions = [tx(1000, 5), tx(3000, 2), tx(1000, 4), tx(1000, 3), tx(1000, 1)];
    expect(computeLargeTransactionInsights(transactions, kindNames, NOW)).toEqual([]);
  });

  it('returns nothing for an empty transaction list', () => {
    expect(computeLargeTransactionInsights([], kindNames)).toEqual([]);
  });
});

describe('getInsights', () => {
  let t: TestDb;
  const userId = 'user-1';
  const tenantId = 'default';

  beforeEach(async () => {
    t = await createTestDb();
  });

  afterEach(() => {
    t.close();
  });

  async function seedCategory() {
    const now = Date.now();
    await t.db.insert(schema.categories).values({
      id: 'cat-eating-out',
      tenantId,
      userId,
      name: 'Eating out',
      type: 'dynamic',
      createdAt: now,
      updatedAt: now,
    });
    await t.db.insert(schema.kinds).values({
      id: 'kind-eating-out',
      tenantId,
      userId,
      categoryId: 'cat-eating-out',
      name: 'Eating out',
      predictedAmountMinor: 15_000,
      currency: 'EUR',
      recurrenceIntervalUnit: null,
      recurrenceIntervalCount: null,
      recurrenceAnchorDate: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  it('produces zero insights against a single seeded month — nothing to compare against yet', async () => {
    await seedCategory();
    const now = Date.now();
    await t.db.insert(schema.transactions).values({
      id: 'tx-1',
      tenantId,
      userId,
      kindId: 'kind-eating-out',
      amountMinor: 20_000, // over the 15_000 budget — but only one month exists
      currency: 'EUR',
      occurredAt: now,
      note: null,
      createdAt: now,
      updatedAt: now,
    });

    const insights = await getInsights(t.ledger, userId);
    expect(insights).toEqual([]);
  });

  it('a second seeded over-budget month produces exactly the expected tip', async () => {
    await seedCategory();
    const now = Date.now();
    const july = Date.UTC(2026, 6, 15);
    const august = Date.UTC(2026, 7, 15);
    await t.db.insert(schema.transactions).values([
      {
        id: 'tx-july',
        tenantId,
        userId,
        kindId: 'kind-eating-out',
        amountMinor: 18_000,
        currency: 'EUR',
        occurredAt: july,
        note: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'tx-august',
        tenantId,
        userId,
        kindId: 'kind-eating-out',
        amountMinor: 20_000,
        currency: 'EUR',
        occurredAt: august,
        note: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const insights = await getInsights(t.ledger, userId);
    expect(insights).toContain('Eating out has run over budget 2 months running.');
  });

  it('flags an unusually large transaction through the full getInsights pipeline', async () => {
    await seedCategory();
    const now = Date.now();
    await t.db.insert(schema.transactions).values([
      {
        id: 'tx-1',
        tenantId,
        userId,
        kindId: 'kind-eating-out',
        amountMinor: 1_000,
        currency: 'EUR',
        occurredAt: now - 4000,
        note: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'tx-2',
        tenantId,
        userId,
        kindId: 'kind-eating-out',
        amountMinor: 1_000,
        currency: 'EUR',
        occurredAt: now - 3000,
        note: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'tx-3',
        tenantId,
        userId,
        kindId: 'kind-eating-out',
        amountMinor: 1_000,
        currency: 'EUR',
        occurredAt: now - 2000,
        note: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'tx-4',
        tenantId,
        userId,
        kindId: 'kind-eating-out',
        amountMinor: 5_000,
        currency: 'EUR',
        occurredAt: now - 1000,
        note: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const insights = await getInsights(t.ledger, userId);
    expect(insights).toContain(
      'Your latest Eating out expense of €50.00 is unusually large compared to your typical €10.00.',
    );
  });
});

describe('computeOverBudgetStreakInsights — calendar contiguity', () => {
  const over = (categoryId: string, name: string) => ({
    categoryId,
    name,
    actualMinor: 30_000,
    predictedMinor: 20_000,
    currency: 'EUR',
    varianceLabel: '+50% vs. budget',
  });

  const period = (year: number, month: number, topCategories: ReturnType<typeof over>[]) => ({
    year,
    month,
    isCurrent: false,
    incomeMinor: 0,
    spentMinor: 0,
    projectedSavingsMinor: 0,
    actualSavingsMinor: 0,
    actualSavingsNetOfJarsMinor: 0,
    unconvertedCurrencies: [],
    reviewed: false,
    reviewedAt: null,
    topCategories,
  });

  it('does not count a gap month as part of a streak', async () => {
    // March and January are over budget; February had no activity at all, so
    // `getReportsData` produces no period for it. Walking the list directly
    // read this as "2 months running".
    const insights = computeOverBudgetStreakInsights([
      period(2026, 3, [over('cat-1', 'Eating out')]),
      period(2026, 1, [over('cat-1', 'Eating out')]),
    ]);
    expect(insights).toEqual([]);
  });

  it('still counts genuinely consecutive months, across a year boundary', async () => {
    const insights = computeOverBudgetStreakInsights([
      period(2026, 1, [over('cat-1', 'Eating out')]),
      period(2025, 12, [over('cat-1', 'Eating out')]),
    ]);
    expect(insights).toEqual(['Eating out has run over budget 2 months running.']);
  });
});

describe('computeLargeTransactionInsights — locale', () => {
  it('formats money in the viewer’s locale, not a hardcoded en-US', () => {
    const now = Date.UTC(2026, 5, 3);
    const transactions = [
      { kindId: 'k1', amountMinor: 100_00, occurredAt: now - 4000, currency: 'EUR' },
      { kindId: 'k1', amountMinor: 100_00, occurredAt: now - 3000, currency: 'EUR' },
      { kindId: 'k1', amountMinor: 100_00, occurredAt: now - 2000, currency: 'EUR' },
      { kindId: 'k1', amountMinor: 100_00, occurredAt: now - 1000, currency: 'EUR' },
      { kindId: 'k1', amountMinor: 1_000_00, occurredAt: now, currency: 'EUR' },
    ];
    const names = new Map([['k1', 'groceries']]);

    const [enUs] = computeLargeTransactionInsights(transactions, names, now, 'en-US');
    const [deDe] = computeLargeTransactionInsights(transactions, names, now, 'de-DE');
    expect(enUs).toContain('€1,000.00');
    // German formatting: '.' groups and ',' decimals, symbol trailing.
    expect(deDe).toContain('1.000,00');
    expect(deDe).not.toBe(enUs);
  });
});
