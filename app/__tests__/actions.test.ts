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

  it('rejects an unauthenticated caller for the read-only getExpenseFormOptions too', async () => {
    actAs(null);
    await expect(actions.getExpenseFormOptions()).rejects.toThrow('Not authenticated');
  });

  it("getExpenseFormOptions never returns another user's categories", async () => {
    const fixture = await setup();
    actAs(outsider);
    await actions.createCategoryWithKind({
      name: 'Rent',
      type: 'fixed',
      predictedAmountMinor: 170_000,
      currency: 'EUR',
    });

    actAs(owner);
    const { categories } = await actions.getExpenseFormOptions();
    expect(categories.map((c) => c.id)).toEqual([fixture.categoryId]);
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

  it('getExpenseFormOptions returns the category/kind tree shaped for the expense-form pickers', async () => {
    const fixture = await setup();
    const { categories } = await actions.getExpenseFormOptions();
    expect(categories).toEqual([
      {
        id: fixture.categoryId,
        name: 'Groceries',
        kinds: [{ id: fixture.kindId, name: 'Groceries', currency: 'EUR' }],
      },
    ]);
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

describe('L.7 — accounts, assets, deposits, loans, people', () => {
  it('denies every new mutation on another user\'s rows, with no side effects', async () => {
    actAs(owner);
    await actions.createAccount({
      name: 'Checking',
      type: 'bank',
      balanceMinor: 10_000,
      currency: 'EUR',
    });
    const account = must((await t.db.select().from(schema.accounts))[0], 'account');
    await actions.createAsset({ name: 'Gold', type: 'physical', valueMinor: 5_000, currency: 'EUR' });
    const asset = must((await t.db.select().from(schema.assets))[0], 'asset');
    await actions.createDeposit({ name: 'Apartment', amountMinor: 3_000, currency: 'EUR' });
    const deposit = must((await t.db.select().from(schema.deposits))[0], 'deposit');
    await actions.createLoan({
      name: 'Car loan',
      lender: 'City Bank',
      principalMinor: 10_000,
      remainingBalanceMinor: 8_000,
      installmentAmountMinor: 500,
      currency: 'EUR',
      startDate: '2025-01-01',
      endDate: '2027-12-01',
    });
    const loan = must((await t.db.select().from(schema.loans))[0], 'loan');
    await actions.createPerson({ name: 'Alex', currency: 'EUR' });
    const person = must((await t.db.select().from(schema.people))[0], 'person');

    const before = {
      accounts: await t.db.select().from(schema.accounts),
      assets: await t.db.select().from(schema.assets),
      deposits: await t.db.select().from(schema.deposits),
      loans: await t.db.select().from(schema.loans),
      kinds: await t.db.select().from(schema.kinds),
      people: await t.db.select().from(schema.people),
      peopleTransactions: await t.db.select().from(schema.peopleTransactions),
    };

    actAs(outsider);
    const denials = await Promise.all([
      actions.updateAccount({ accountId: account.id, name: 'stolen' }),
      actions.deleteAccount({ accountId: account.id }),
      actions.updateAsset({ assetId: asset.id, name: 'stolen' }),
      actions.deleteAsset({ assetId: asset.id }),
      actions.updateDeposit({ depositId: deposit.id, name: 'stolen' }),
      actions.deleteDeposit({ depositId: deposit.id }),
      actions.updateLoan({ loanId: loan.id, name: 'stolen' }),
      actions.deleteLoan({ loanId: loan.id }),
      actions.deletePerson({ personId: person.id }),
      actions.createPeopleTransaction({ personId: person.id, amountMinor: 100 }),
    ]);
    for (const result of denials) expect(result.ok).toBe(false);

    expect(await t.db.select().from(schema.accounts)).toEqual(before.accounts);
    expect(await t.db.select().from(schema.assets)).toEqual(before.assets);
    expect(await t.db.select().from(schema.deposits)).toEqual(before.deposits);
    expect(await t.db.select().from(schema.loans)).toEqual(before.loans);
    expect(await t.db.select().from(schema.kinds)).toEqual(before.kinds);
    expect(await t.db.select().from(schema.people)).toEqual(before.people);
    expect(await t.db.select().from(schema.peopleTransactions)).toEqual(before.peopleTransactions);
  });

  it('creates and updates a bank account and a credit card', async () => {
    actAs(owner);
    expect(
      (await actions.createAccount({ name: 'Checking', type: 'bank', balanceMinor: 10_000, currency: 'EUR' }))
        .ok,
    ).toBe(true);
    expect(
      (
        await actions.createAccount({
          name: 'Everyday Card',
          type: 'credit_card',
          balanceMinor: 34_000,
          creditLimitMinor: 200_000,
          currency: 'EUR',
        })
      ).ok,
    ).toBe(true);

    const card = must(
      (await t.db.select().from(schema.accounts).where(eq(schema.accounts.type, 'credit_card')))[0],
      'card',
    );
    expect(card.creditLimitMinor).toBe(200_000);

    expect((await actions.updateAccount({ accountId: card.id, balanceMinor: 40_000 })).ok).toBe(true);
    const updated = must(
      (await t.db.select().from(schema.accounts).where(eq(schema.accounts.id, card.id)))[0],
      'updated card',
    );
    expect(updated.balanceMinor).toBe(40_000);
  });

  it('createLoan creates its linked Fixed kind under a shared "Loans" category', async () => {
    actAs(owner);
    const result = await actions.createLoan({
      name: 'Car loan',
      lender: 'City Bank',
      principalMinor: 1_000_000,
      remainingBalanceMinor: 420_000,
      installmentAmountMinor: 18_000,
      currency: 'EUR',
      startDate: '2025-01-01',
      endDate: '2027-12-01',
    });
    expect(result.ok).toBe(true);

    const loan = must((await t.db.select().from(schema.loans))[0], 'loan');
    expect(loan.userId).toBe(owner.id);

    const kind = must(
      (await t.db.select().from(schema.kinds).where(eq(schema.kinds.id, loan.linkedKindId)))[0],
      'linked kind',
    );
    expect(kind.name).toBe('Car loan');
    expect(kind.predictedAmountMinor).toBe(18_000);

    const category = must(
      (await t.db.select().from(schema.categories).where(eq(schema.categories.id, kind.categoryId)))[0],
      'linked category',
    );
    expect(category.name).toBe('Loans');
    expect(category.type).toBe('fixed');
  });

  it('a second loan reuses the same shared "Loans" category, not a duplicate', async () => {
    actAs(owner);
    await actions.createLoan({
      name: 'Car loan',
      lender: 'City Bank',
      principalMinor: 1_000_000,
      remainingBalanceMinor: 420_000,
      installmentAmountMinor: 18_000,
      currency: 'EUR',
      startDate: '2025-01-01',
      endDate: '2027-12-01',
    });
    await actions.createLoan({
      name: 'Student loan',
      lender: 'State Bank',
      principalMinor: 2_000_000,
      remainingBalanceMinor: 1_500_000,
      installmentAmountMinor: 25_000,
      currency: 'EUR',
      startDate: '2020-01-01',
      endDate: '2030-01-01',
    });

    const loansCategories = await t.db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.name, 'Loans'));
    expect(loansCategories).toHaveLength(1);
    const kindsUnderIt = await t.db
      .select()
      .from(schema.kinds)
      .where(eq(schema.kinds.categoryId, must(loansCategories[0], 'Loans category').id));
    expect(kindsUnderIt.map((k) => k.name).sort()).toEqual(['Car loan', 'Student loan']);
  });

  it('updateLoan keeps the linked kind\'s name/budget in sync', async () => {
    actAs(owner);
    await actions.createLoan({
      name: 'Car loan',
      lender: 'City Bank',
      principalMinor: 1_000_000,
      remainingBalanceMinor: 420_000,
      installmentAmountMinor: 18_000,
      currency: 'EUR',
      startDate: '2025-01-01',
      endDate: '2027-12-01',
    });
    const loan = must((await t.db.select().from(schema.loans))[0], 'loan');

    expect(
      (
        await actions.updateLoan({
          loanId: loan.id,
          name: 'Car loan (refinanced)',
          installmentAmountMinor: 15_000,
        })
      ).ok,
    ).toBe(true);

    const updatedLoan = must(
      (await t.db.select().from(schema.loans).where(eq(schema.loans.id, loan.id)))[0],
      'updated loan',
    );
    expect(updatedLoan.installmentAmountMinor).toBe(15_000);

    const kind = must(
      (await t.db.select().from(schema.kinds).where(eq(schema.kinds.id, loan.linkedKindId)))[0],
      'linked kind',
    );
    expect(kind.name).toBe('Car loan (refinanced)');
    expect(kind.predictedAmountMinor).toBe(15_000);
  });

  it('deleteLoan removes the loan and its linked kind, leaving no orphan', async () => {
    actAs(owner);
    await actions.createLoan({
      name: 'Car loan',
      lender: 'City Bank',
      principalMinor: 1_000_000,
      remainingBalanceMinor: 420_000,
      installmentAmountMinor: 18_000,
      currency: 'EUR',
      startDate: '2025-01-01',
      endDate: '2027-12-01',
    });
    const loan = must((await t.db.select().from(schema.loans))[0], 'loan');

    expect((await actions.deleteLoan({ loanId: loan.id })).ok).toBe(true);
    expect(await t.db.select().from(schema.loans)).toHaveLength(0);
    expect(
      await t.db.select().from(schema.kinds).where(eq(schema.kinds.id, loan.linkedKindId)),
    ).toHaveLength(0);
    // The shared "Loans" category itself is left behind (documented, minor
    // cosmetic gap — see LOANS_CATEGORY_NAME's doc comment) — only the
    // kind is expected to be gone.
    expect(await t.db.select().from(schema.categories).where(eq(schema.categories.name, 'Loans'))).toHaveLength(1);
  });

  it('createPeopleTransaction keeps the cached balance in sync, both directions', async () => {
    actAs(owner);
    await actions.createPerson({ name: 'Alex', currency: 'EUR' });
    const person = must((await t.db.select().from(schema.people))[0], 'person');

    expect(
      (await actions.createPeopleTransaction({ personId: person.id, amountMinor: 18_000 })).ok,
    ).toBe(true);
    let updated = must(
      (await t.db.select().from(schema.people).where(eq(schema.people.id, person.id)))[0],
      'person after +180',
    );
    expect(updated.balanceMinor).toBe(18_000);

    expect(
      (await actions.createPeopleTransaction({ personId: person.id, amountMinor: -6_000 })).ok,
    ).toBe(true);
    updated = must(
      (await t.db.select().from(schema.people).where(eq(schema.people.id, person.id)))[0],
      'person after -60',
    );
    expect(updated.balanceMinor).toBe(12_000);

    expect(await t.db.select().from(schema.peopleTransactions)).toHaveLength(2);
  });

  it('createPeopleTransaction rejects a zero amount', async () => {
    actAs(owner);
    await actions.createPerson({ name: 'Alex', currency: 'EUR' });
    const person = must((await t.db.select().from(schema.people))[0], 'person');
    const result = await actions.createPeopleTransaction({ personId: person.id, amountMinor: 0 });
    expect(result.ok).toBe(false);
    expect(await t.db.select().from(schema.peopleTransactions)).toHaveLength(0);
  });

  it('deletePerson cascades their transaction history', async () => {
    actAs(owner);
    await actions.createPerson({ name: 'Alex', currency: 'EUR' });
    const person = must((await t.db.select().from(schema.people))[0], 'person');
    await actions.createPeopleTransaction({ personId: person.id, amountMinor: 5_000 });

    expect((await actions.deletePerson({ personId: person.id })).ok).toBe(true);
    expect(await t.db.select().from(schema.people)).toHaveLength(0);
    expect(await t.db.select().from(schema.peopleTransactions)).toHaveLength(0);
  });
});

describe('L.8 — markPeriodReviewed', () => {
  it('inserts a review row for the given period', async () => {
    actAs(owner);
    const result = await actions.markPeriodReviewed({ year: 2026, month: 7 });
    expect(result.ok).toBe(true);
    const rows = await t.db.select().from(schema.periodReviews);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: owner.id, year: 2026, month: 7 });
  });

  it('is idempotent — marking an already-reviewed period again does not error or duplicate', async () => {
    actAs(owner);
    expect((await actions.markPeriodReviewed({ year: 2026, month: 7 })).ok).toBe(true);
    expect((await actions.markPeriodReviewed({ year: 2026, month: 7 })).ok).toBe(true);
    expect(await t.db.select().from(schema.periodReviews)).toHaveLength(1);
  });

  it('denies an unauthenticated caller', async () => {
    actAs(null);
    await expect(actions.markPeriodReviewed({ year: 2026, month: 7 })).rejects.toThrow(
      'Not authenticated',
    );
  });

  it("never mixes up two different users' review rows for the same period", async () => {
    actAs(owner);
    await actions.markPeriodReviewed({ year: 2026, month: 7 });
    actAs(outsider);
    await actions.markPeriodReviewed({ year: 2026, month: 7 });

    const rows = await t.db.select().from(schema.periodReviews);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.userId).sort()).toEqual([outsider.id, owner.id].sort());
  });
});
