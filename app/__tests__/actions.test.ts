/**
 * Server-action authorization + behavior tests (L.3 review checklist):
 * every action denies a session acting on another user's rows without
 * mutating anything, no action accepts a client-supplied `userId` (there is
 * no such parameter on any action's input type at all — ownership always
 * comes from `requireUser()`'s resolved session, never client input), and
 * saving-type category/kind creation is rejected (reserved for L.12). Runs
 * against the real generated migrations on an ephemeral libsql DB
 * (production client semantics) with the SDK mocked to impersonate
 * switchable users.
 */
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../_db/__tests__/test-db';
import * as schema from '../_db/schema';

const harness = vi.hoisted(() => ({
  currentUser: null as { id: string; tenantId: string } | null,
  dbClient: null as unknown,
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@sovereignfs/sdk', () => ({
  sdk: {
    auth: {
      requireSession: vi.fn(async () => {
        if (!harness.currentUser) throw new Error('Not authenticated');
        return { user: harness.currentUser };
      }),
    },
    db: { getClient: vi.fn(async () => harness.dbClient) },
  },
}));

import * as actions from '../actions';

const owner = { id: 'user-owner', tenantId: 'default' };
const outsider = { id: 'user-outsider', tenantId: 'default' };

let t: TestDb;

function actAs(user: { id: string; tenantId: string } | null): void {
  harness.currentUser = user;
}

/** Narrow a possibly-undefined value (noUncheckedIndexedAccess / find) with a hard failure. */
function must<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`expected ${label} to exist`);
  return value;
}

interface Fixture {
  currencyId: string;
  incomeId: string;
  categoryId: string;
  kindId: string;
  transactionId: string;
}

/** As `owner`: one currency, one income, one Dynamic category+kind, one transaction. */
async function setup(): Promise<Fixture> {
  actAs(owner);
  expect((await actions.createCurrency({ code: 'EUR', isBase: true })).ok).toBe(true);
  const currency = must((await t.db.select().from(schema.currencies))[0], 'currency');

  expect(
    (await actions.createIncome({ label: 'Primary', amountMinor: 400_000, currency: 'EUR', kind: 'primary' }))
      .ok,
  ).toBe(true);
  const income = must((await t.db.select().from(schema.incomes))[0], 'income');

  expect((await actions.createCategory({ name: 'Groceries', type: 'dynamic' })).ok).toBe(true);
  const category = must((await t.db.select().from(schema.categories))[0], 'category');

  expect(
    (
      await actions.createKind({
        categoryId: category.id,
        name: 'Groceries',
        predictedAmountMinor: 15_000,
        currency: 'EUR',
      })
    ).ok,
  ).toBe(true);
  const kind = must((await t.db.select().from(schema.kinds))[0], 'kind');

  expect(
    (await actions.createTransaction({ kindId: kind.id, amountMinor: 2_340, currency: 'EUR' })).ok,
  ).toBe(true);
  const transaction = must((await t.db.select().from(schema.transactions))[0], 'transaction');

  return {
    currencyId: currency.id,
    incomeId: income.id,
    categoryId: category.id,
    kindId: kind.id,
    transactionId: transaction.id,
  };
}

beforeEach(async () => {
  t = await createTestDb();
  harness.dbClient = t.db;
});

afterEach(() => {
  t.close();
  actAs(null);
});

describe('authorization — a session can never mutate another user\'s rows', () => {
  it('denies every mutation on another user\'s rows, with no side effects', async () => {
    const fixture = await setup();
    const before = {
      currencies: await t.db.select().from(schema.currencies),
      incomes: await t.db.select().from(schema.incomes),
      categories: await t.db.select().from(schema.categories),
      kinds: await t.db.select().from(schema.kinds),
      transactions: await t.db.select().from(schema.transactions),
    };

    actAs(outsider);
    const denials = await Promise.all([
      actions.setBaseCurrency({ currencyId: fixture.currencyId }),
      actions.deleteCurrency({ currencyId: fixture.currencyId }),
      actions.updateIncome({ incomeId: fixture.incomeId, label: 'stolen' }),
      actions.deleteIncome({ incomeId: fixture.incomeId }),
      actions.deleteCategory({ categoryId: fixture.categoryId }),
      actions.createKind({
        categoryId: fixture.categoryId,
        name: 'stolen',
        predictedAmountMinor: 1,
        currency: 'EUR',
      }),
      actions.updateKindBudget({ kindId: fixture.kindId, predictedAmountMinor: 1 }),
      actions.deleteKind({ kindId: fixture.kindId }),
      actions.createTransaction({ kindId: fixture.kindId, amountMinor: 1, currency: 'EUR' }),
      actions.deleteTransaction({ transactionId: fixture.transactionId }),
    ]);
    for (const result of denials) expect(result.ok).toBe(false);

    expect(await t.db.select().from(schema.currencies)).toEqual(before.currencies);
    expect(await t.db.select().from(schema.incomes)).toEqual(before.incomes);
    expect(await t.db.select().from(schema.categories)).toEqual(before.categories);
    expect(await t.db.select().from(schema.kinds)).toEqual(before.kinds);
    expect(await t.db.select().from(schema.transactions)).toEqual(before.transactions);
  });

  it('rejects an unauthenticated caller', async () => {
    actAs(null);
    await expect(actions.createCurrency({ code: 'EUR' })).rejects.toThrow('Not authenticated');
  });
});

describe('saving-type categories/kinds are rejected (reserved for L.12)', () => {
  it('rejects creating a saving-type category', async () => {
    actAs(owner);
    const result = await actions.createCategory({
      // @ts-expect-error — 'saving' is deliberately not in this action's accepted type union
      type: 'saving',
      name: 'Travel jar',
    });
    expect(result.ok).toBe(false);
    expect(await t.db.select().from(schema.categories)).toHaveLength(0);
  });

  it('rejects creating a kind under an (already-existing) saving-type category', async () => {
    actAs(owner);
    // Insert a saving-type category directly — createCategory itself can never
    // produce one, but a future migration/bug could still leave one behind,
    // so createKind must check the category's actual type, not just trust
    // that no saving categories exist yet.
    await t.db.insert(schema.categories).values({
      id: 'cat-saving',
      tenantId: 'default',
      userId: owner.id,
      name: 'Travel jar',
      type: 'saving',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const result = await actions.createKind({
      categoryId: 'cat-saving',
      name: 'Travel jar',
      predictedAmountMinor: 5_000,
      currency: 'EUR',
    });
    expect(result.ok).toBe(false);
    expect(await t.db.select().from(schema.kinds)).toHaveLength(0);
  });
});

describe('happy path', () => {
  it('creates a currency, income, category/kind, and transaction owned by the caller', async () => {
    const fixture = await setup();
    const currency = must(
      (await t.db.select().from(schema.currencies).where(eq(schema.currencies.id, fixture.currencyId)))[0],
      'currency',
    );
    expect(currency.userId).toBe(owner.id);
    expect(currency.isBase).toBe(1);

    const kind = must(
      (await t.db.select().from(schema.kinds).where(eq(schema.kinds.id, fixture.kindId)))[0],
      'kind',
    );
    expect(kind.userId).toBe(owner.id);
    expect(kind.predictedAmountMinor).toBe(15_000);
  });

  it('setBaseCurrency moves the base flag without leaving two currencies flagged', async () => {
    actAs(owner);
    await actions.createCurrency({ code: 'EUR', isBase: true });
    await actions.createCurrency({ code: 'USD' });
    const usd = must(
      (await t.db.select().from(schema.currencies).where(eq(schema.currencies.code, 'USD')))[0],
      'USD row',
    );

    expect((await actions.setBaseCurrency({ currencyId: usd.id })).ok).toBe(true);
    const all = await t.db.select().from(schema.currencies);
    expect(all.filter((c) => c.isBase === 1)).toHaveLength(1);
    expect(must(all.find((c) => c.code === 'USD'), 'USD').isBase).toBe(1);
  });

  it('createCategoryWithKind creates both rows atomically, correctly owned', async () => {
    actAs(owner);
    const result = await actions.createCategoryWithKind({
      name: 'Groceries',
      type: 'dynamic',
      predictedAmountMinor: 15_000,
      currency: 'EUR',
    });
    expect(result.ok).toBe(true);

    const category = must((await t.db.select().from(schema.categories))[0], 'category');
    expect(category.userId).toBe(owner.id);
    expect(category.type).toBe('dynamic');

    const kind = must((await t.db.select().from(schema.kinds))[0], 'kind');
    expect(kind.userId).toBe(owner.id);
    expect(kind.categoryId).toBe(category.id);
    expect(kind.predictedAmountMinor).toBe(15_000);
  });

  it('createCategoryWithKind rejects a saving-type category, creating neither row', async () => {
    actAs(owner);
    const result = await actions.createCategoryWithKind({
      // @ts-expect-error — 'saving' is deliberately not in this action's accepted type union
      type: 'saving',
      name: 'Travel jar',
      predictedAmountMinor: 5_000,
      currency: 'EUR',
    });
    expect(result.ok).toBe(false);
    expect(await t.db.select().from(schema.categories)).toHaveLength(0);
    expect(await t.db.select().from(schema.kinds)).toHaveLength(0);
  });
});
