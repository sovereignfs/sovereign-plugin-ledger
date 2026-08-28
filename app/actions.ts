'use server';

/**
 * Server actions — the mutation layer every surface (web + mobile) calls.
 *
 * Every action:
 * 1. `requireUser()` — session, always first.
 * 2. Row ownership enforced directly in the mutation's own `WHERE` clause
 *    (`user_id = actor.userId`) — Ledger has no membership model, so there's
 *    no separate per-resource role check the way a shared-resource plugin
 *    needs. A forged id belonging to another user simply matches no row.
 * 3. Returns `ActionResult` — domain failures are values, never thrown.
 *
 * Dynamic and Fixed categories/kinds only via `createCategory`/`createKind`
 * — saving-type creation is deliberately rejected there, reserved for
 * L.12's jar-auto-provisioning logic.
 */
import { revalidatePath } from 'next/cache';
import { and, eq, inArray, sql } from 'drizzle-orm';
import * as schema from './_db/schema';
import { fail, ok, type ActionResult } from './_lib/action-result';
import { requireUser } from './_lib/authz';
import { getDb } from './_lib/db';
import { newId } from './_lib/ids';
import { listCategoriesWithKinds, listSavingCategoriesWithKinds } from './_lib/queries';

const NOT_FOUND_CURRENCY = 'Currency not found.';
const NOT_FOUND_INCOME = 'Income not found.';
const NOT_FOUND_CATEGORY = 'Category not found.';
const NOT_FOUND_KIND = 'Kind not found.';
const NOT_FOUND_TRANSACTION = 'Transaction not found.';
const NOT_FOUND_ACCOUNT = 'Account not found.';
const NOT_FOUND_ASSET = 'Asset not found.';
const NOT_FOUND_DEPOSIT = 'Deposit not found.';
const NOT_FOUND_LOAN = 'Loan not found.';
const NOT_FOUND_PERSON = 'Person not found.';
const NOT_FOUND_JAR = 'Saving jar not found.';
const LOAN_LINKED_KIND = 'A loan is linked to this — delete the loan from Accounts first.';

/**
 * Every loan's linked kind lives under one shared Fixed category per user,
 * found-or-created on the first loan — not one dedicated category per loan.
 * A user with several loans sees them as sibling subcategories under one
 * "Loans" row on the Budget page, the same grouping shape as any other
 * multi-kind category, rather than cluttering Budget's top-level list with
 * one row per loan. Deleting a loan removes only its own kind, never this
 * shared category (see `deleteLoan`) — an empty "Loans" category can be
 * left behind once every loan is gone, a minor known cosmetic gap, not a
 * correctness bug (its predicted/actual both correctly show €0).
 */
const LOANS_CATEGORY_NAME = 'Loans';

function refresh(): void {
  revalidatePath('/ledger', 'layout');
}

function cleanText(raw: unknown, label: string, max = 200): string | ActionResult {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value.length === 0) return fail(`${label} is required.`);
  if (value.length > max) return fail(`${label} must be ${max} characters or fewer.`);
  return value;
}

function cleanAmountMinor(raw: unknown, label: string): number | ActionResult {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
    return fail(`${label} must be a whole number of minor units (e.g. cents), zero or greater.`);
  }
  return raw;
}

function cleanCurrencyCode(raw: unknown): string | ActionResult {
  const value = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!/^[A-Z]{3}$/.test(value)) return fail('Currency code must be a 3-letter code (e.g. EUR).');
  return value;
}

/** Unlike `cleanAmountMinor`: allows negative (a people-transaction delta), never zero. */
function cleanSignedAmountMinor(raw: unknown, label: string): number | ActionResult {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw === 0) {
    return fail(`${label} must be a non-zero whole number of minor units (e.g. cents).`);
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Currencies

export async function createCurrency(input: {
  code: string;
  isBase?: boolean;
}): Promise<ActionResult> {
  const actor = await requireUser();
  const code = cleanCurrencyCode(input.code);
  if (typeof code !== 'string') return code;
  const db = await getDb();
  const now = Date.now();

  await db.transaction(async (tx) => {
    if (input.isBase) {
      await tx
        .update(schema.currencies)
        .set({ isBase: 0, updatedAt: now })
        .where(eq(schema.currencies.userId, actor.userId));
    }
    await tx.insert(schema.currencies).values({
      id: newId(),
      tenantId: actor.tenantId,
      userId: actor.userId,
      code,
      isBase: input.isBase ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    });
  });
  refresh();
  return ok('Currency added.');
}

export async function setBaseCurrency(input: { currencyId: string }): Promise<ActionResult> {
  const actor = await requireUser();
  const db = await getDb();
  const now = Date.now();

  const owned = await db
    .select({ id: schema.currencies.id })
    .from(schema.currencies)
    .where(
      and(eq(schema.currencies.id, input.currencyId), eq(schema.currencies.userId, actor.userId)),
    );
  if (owned.length === 0) return fail(NOT_FOUND_CURRENCY);

  await db.transaction(async (tx) => {
    await tx
      .update(schema.currencies)
      .set({ isBase: 0, updatedAt: now })
      .where(eq(schema.currencies.userId, actor.userId));
    await tx
      .update(schema.currencies)
      .set({ isBase: 1, updatedAt: now })
      .where(eq(schema.currencies.id, input.currencyId));
  });
  refresh();
  return ok('Base currency updated.');
}

export async function deleteCurrency(input: { currencyId: string }): Promise<ActionResult> {
  const actor = await requireUser();
  const db = await getDb();

  const [currency] = await db
    .select({ isBase: schema.currencies.isBase })
    .from(schema.currencies)
    .where(
      and(eq(schema.currencies.id, input.currencyId), eq(schema.currencies.userId, actor.userId)),
    );
  if (!currency) return fail(NOT_FOUND_CURRENCY);
  if (currency.isBase === 1) {
    return fail('Cannot delete your base currency — set a different currency as base first.');
  }

  await db
    .delete(schema.currencies)
    .where(
      and(eq(schema.currencies.id, input.currencyId), eq(schema.currencies.userId, actor.userId)),
    );
  refresh();
  return ok('Currency removed.');
}

// ---------------------------------------------------------------------------
// Incomes

export async function createIncome(input: {
  label: string;
  amountMinor: number;
  currency: string;
  kind: 'primary' | 'secondary';
}): Promise<ActionResult> {
  const actor = await requireUser();
  const label = cleanText(input.label, 'Label');
  if (typeof label !== 'string') return label;
  const amountMinor = cleanAmountMinor(input.amountMinor, 'Amount');
  if (typeof amountMinor !== 'number') return amountMinor;
  if (input.kind !== 'primary' && input.kind !== 'secondary') {
    return fail('Income kind must be "primary" or "secondary".');
  }
  const db = await getDb();
  const now = Date.now();
  await db.insert(schema.incomes).values({
    id: newId(),
    tenantId: actor.tenantId,
    userId: actor.userId,
    label,
    amountMinor,
    currency: input.currency,
    kind: input.kind,
    createdAt: now,
    updatedAt: now,
  });
  refresh();
  return ok('Income added.');
}

export async function updateIncome(input: {
  incomeId: string;
  label?: string;
  amountMinor?: number;
}): Promise<ActionResult> {
  const actor = await requireUser();
  const patch: { label?: string; amountMinor?: number; updatedAt: number } = {
    updatedAt: Date.now(),
  };
  if (input.label !== undefined) {
    const label = cleanText(input.label, 'Label');
    if (typeof label !== 'string') return label;
    patch.label = label;
  }
  if (input.amountMinor !== undefined) {
    const amountMinor = cleanAmountMinor(input.amountMinor, 'Amount');
    if (typeof amountMinor !== 'number') return amountMinor;
    patch.amountMinor = amountMinor;
  }
  const db = await getDb();
  const updated = await db
    .update(schema.incomes)
    .set(patch)
    .where(and(eq(schema.incomes.id, input.incomeId), eq(schema.incomes.userId, actor.userId)))
    .returning({ id: schema.incomes.id });
  if (updated.length === 0) return fail(NOT_FOUND_INCOME);
  refresh();
  return ok('Income updated.');
}

export async function deleteIncome(input: { incomeId: string }): Promise<ActionResult> {
  const actor = await requireUser();
  const db = await getDb();
  const deleted = await db
    .delete(schema.incomes)
    .where(and(eq(schema.incomes.id, input.incomeId), eq(schema.incomes.userId, actor.userId)))
    .returning({ id: schema.incomes.id });
  if (deleted.length === 0) return fail(NOT_FOUND_INCOME);
  refresh();
  return ok('Income removed.');
}

// ---------------------------------------------------------------------------
// Categories & kinds

/**
 * Creates a category and its first kind in one transaction — for callers
 * (the setup wizard, L.4; `CreateSavingJarDialog`, L.12) that need to
 * create both in the same gesture and have no way to learn a plain
 * `createCategory`'s new id back (actions return only `ActionResult`,
 * matching this app family's own convention of never echoing created ids
 * to the client). Not a replacement for the separate
 * `createCategory`/`createKind` below, which stay the lower-level
 * primitives for adding a kind to an already-existing category.
 *
 * `type: 'saving'` also creates the linked `ledger_saving_jars` row in the
 * same transaction (L.12's own deliverable) — one jar per saving kind,
 * starting balance zero; `predictedAmountMinor` is the jar's monthly
 * target, same field Dynamic/Fixed already use for their own budgeted
 * amount, not a separate column.
 */
export async function createCategoryWithKind(input: {
  name: string;
  type: 'dynamic' | 'fixed' | 'saving';
  predictedAmountMinor: number;
  currency: string;
}): Promise<ActionResult> {
  const actor = await requireUser();
  const name = cleanText(input.name, 'Category name');
  if (typeof name !== 'string') return name;
  const predictedAmountMinor = cleanAmountMinor(input.predictedAmountMinor, 'Budgeted amount');
  if (typeof predictedAmountMinor !== 'number') return predictedAmountMinor;

  const db = await getDb();
  const now = Date.now();
  const categoryId = newId();
  await db.transaction(async (tx) => {
    await tx.insert(schema.categories).values({
      id: categoryId,
      tenantId: actor.tenantId,
      userId: actor.userId,
      name,
      type: input.type,
      createdAt: now,
      updatedAt: now,
    });
    const kindId = newId();
    await tx.insert(schema.kinds).values({
      id: kindId,
      tenantId: actor.tenantId,
      userId: actor.userId,
      categoryId,
      name,
      predictedAmountMinor,
      currency: input.currency,
      recurrenceIntervalUnit: null,
      recurrenceIntervalCount: null,
      recurrenceAnchorDate: null,
      createdAt: now,
      updatedAt: now,
    });
    if (input.type === 'saving') {
      await tx.insert(schema.savingJars).values({
        id: newId(),
        tenantId: actor.tenantId,
        userId: actor.userId,
        kindId,
        balanceMinor: 0,
        currency: input.currency,
        createdAt: now,
        updatedAt: now,
      });
    }
  });
  refresh();
  return ok('Category added.');
}

export async function createCategory(input: {
  name: string;
  type: 'dynamic' | 'fixed';
}): Promise<ActionResult> {
  const actor = await requireUser();
  const name = cleanText(input.name, 'Category name');
  if (typeof name !== 'string') return name;
  if (input.type !== 'dynamic' && input.type !== 'fixed') {
    return fail("Saving categories aren't supported yet — coming in a later task.");
  }
  const db = await getDb();
  const now = Date.now();
  await db.insert(schema.categories).values({
    id: newId(),
    tenantId: actor.tenantId,
    userId: actor.userId,
    name,
    type: input.type,
    createdAt: now,
    updatedAt: now,
  });
  refresh();
  return ok('Category added.');
}

export async function deleteCategory(input: { categoryId: string }): Promise<ActionResult> {
  const actor = await requireUser();
  const db = await getDb();

  const kindRows = await db
    .select({ id: schema.kinds.id })
    .from(schema.kinds)
    .where(
      and(eq(schema.kinds.categoryId, input.categoryId), eq(schema.kinds.userId, actor.userId)),
    );
  if (kindRows.length > 0) {
    const [linkedLoan] = await db
      .select({ id: schema.loans.id })
      .from(schema.loans)
      .where(
        and(
          inArray(
            schema.loans.linkedKindId,
            kindRows.map((k) => k.id),
          ),
          eq(schema.loans.userId, actor.userId),
        ),
      );
    if (linkedLoan) return fail(LOAN_LINKED_KIND);
  }

  const deleted = await db
    .delete(schema.categories)
    .where(
      and(eq(schema.categories.id, input.categoryId), eq(schema.categories.userId, actor.userId)),
    )
    .returning({ id: schema.categories.id });
  if (deleted.length === 0) return fail(NOT_FOUND_CATEGORY);
  refresh();
  return ok('Category removed.');
}

export async function createKind(input: {
  categoryId: string;
  name: string;
  predictedAmountMinor: number;
  currency: string;
  recurrence?: { unit: 'day' | 'week' | 'month' | 'year'; count: number; anchorDate: string };
}): Promise<ActionResult> {
  const actor = await requireUser();
  const name = cleanText(input.name, 'Kind name');
  if (typeof name !== 'string') return name;
  const predictedAmountMinor = cleanAmountMinor(input.predictedAmountMinor, 'Budgeted amount');
  if (typeof predictedAmountMinor !== 'number') return predictedAmountMinor;

  const db = await getDb();
  const [category] = await db
    .select({ type: schema.categories.type })
    .from(schema.categories)
    .where(
      and(eq(schema.categories.id, input.categoryId), eq(schema.categories.userId, actor.userId)),
    );
  if (!category) return fail(NOT_FOUND_CATEGORY);
  if (category.type === 'saving') {
    return fail("Saving kinds aren't supported yet — coming in a later task.");
  }

  const now = Date.now();
  await db.insert(schema.kinds).values({
    id: newId(),
    tenantId: actor.tenantId,
    userId: actor.userId,
    categoryId: input.categoryId,
    name,
    predictedAmountMinor,
    currency: input.currency,
    recurrenceIntervalUnit: input.recurrence?.unit ?? null,
    recurrenceIntervalCount: input.recurrence?.count ?? null,
    recurrenceAnchorDate: input.recurrence?.anchorDate ?? null,
    createdAt: now,
    updatedAt: now,
  });
  refresh();
  return ok('Kind added.');
}

export async function updateKindBudget(input: {
  kindId: string;
  predictedAmountMinor: number;
}): Promise<ActionResult> {
  const actor = await requireUser();
  const predictedAmountMinor = cleanAmountMinor(input.predictedAmountMinor, 'Budgeted amount');
  if (typeof predictedAmountMinor !== 'number') return predictedAmountMinor;
  const db = await getDb();
  const updated = await db
    .update(schema.kinds)
    .set({ predictedAmountMinor, updatedAt: Date.now() })
    .where(and(eq(schema.kinds.id, input.kindId), eq(schema.kinds.userId, actor.userId)))
    .returning({ id: schema.kinds.id });
  if (updated.length === 0) return fail(NOT_FOUND_KIND);
  refresh();
  return ok('Budget updated.');
}

export async function deleteKind(input: { kindId: string }): Promise<ActionResult> {
  const actor = await requireUser();
  const db = await getDb();

  const [linkedLoan] = await db
    .select({ id: schema.loans.id })
    .from(schema.loans)
    .where(and(eq(schema.loans.linkedKindId, input.kindId), eq(schema.loans.userId, actor.userId)));
  if (linkedLoan) return fail(LOAN_LINKED_KIND);

  const deleted = await db
    .delete(schema.kinds)
    .where(and(eq(schema.kinds.id, input.kindId), eq(schema.kinds.userId, actor.userId)))
    .returning({ id: schema.kinds.id });
  if (deleted.length === 0) return fail(NOT_FOUND_KIND);
  refresh();
  return ok('Kind removed.');
}

// ---------------------------------------------------------------------------
// Transactions — Dynamic + Fixed actuals, always a positive spend amount.

export async function createTransaction(input: {
  kindId: string;
  amountMinor: number;
  currency: string;
  occurredAt?: number;
  note?: string;
}): Promise<ActionResult> {
  const actor = await requireUser();
  const amountMinor = cleanAmountMinor(input.amountMinor, 'Amount');
  if (typeof amountMinor !== 'number') return amountMinor;

  const db = await getDb();
  const [kind] = await db
    .select({ id: schema.kinds.id })
    .from(schema.kinds)
    .where(and(eq(schema.kinds.id, input.kindId), eq(schema.kinds.userId, actor.userId)));
  if (!kind) return fail(NOT_FOUND_KIND);

  const now = Date.now();
  await db.insert(schema.transactions).values({
    id: newId(),
    tenantId: actor.tenantId,
    userId: actor.userId,
    kindId: input.kindId,
    amountMinor,
    currency: input.currency,
    occurredAt: input.occurredAt ?? now,
    note: input.note?.trim() || null,
    createdAt: now,
    updatedAt: now,
  });
  refresh();
  return ok('Expense logged.');
}

export async function deleteTransaction(input: { transactionId: string }): Promise<ActionResult> {
  const actor = await requireUser();
  const db = await getDb();
  const deleted = await db
    .delete(schema.transactions)
    .where(
      and(
        eq(schema.transactions.id, input.transactionId),
        eq(schema.transactions.userId, actor.userId),
      ),
    )
    .returning({ id: schema.transactions.id });
  if (deleted.length === 0) return fail(NOT_FOUND_TRANSACTION);
  refresh();
  return ok('Expense removed.');
}

// ---------------------------------------------------------------------------
// Saving jars (L.12) — `ledger_jar_transactions` amounts are signed
// (positive = contribution, negative = withdrawal, SPEC.md's Data model
// notes), mirroring `createPeopleTransaction`'s pattern below. Unlike a
// person's balance (an open-ended debt/credit that can legitimately go
// negative), a jar can't hold negative money — a withdrawal larger than
// the jar's own balance is rejected rather than letting the jar overdraw,
// the actual point of envelope-style budgeting.

export async function createJarTransaction(input: {
  jarId: string;
  amountMinor: number;
  note?: string;
  occurredAt?: number;
}): Promise<ActionResult> {
  const actor = await requireUser();
  const amountMinor = cleanSignedAmountMinor(input.amountMinor, 'Amount');
  if (typeof amountMinor !== 'number') return amountMinor;

  const db = await getDb();
  const [jar] = await db
    .select({
      id: schema.savingJars.id,
      balanceMinor: schema.savingJars.balanceMinor,
      categoryId: schema.kinds.categoryId,
    })
    .from(schema.savingJars)
    .innerJoin(schema.kinds, eq(schema.kinds.id, schema.savingJars.kindId))
    .where(and(eq(schema.savingJars.id, input.jarId), eq(schema.savingJars.userId, actor.userId)));
  if (!jar) return fail(NOT_FOUND_JAR);
  if (amountMinor < 0 && Math.abs(amountMinor) > jar.balanceMinor) {
    return fail('This jar doesn’t have enough balance for that withdrawal.');
  }

  const now = Date.now();
  await db.transaction(async (tx) => {
    await tx.insert(schema.jarTransactions).values({
      id: newId(),
      tenantId: actor.tenantId,
      userId: actor.userId,
      jarId: input.jarId,
      amountMinor,
      categoryId: jar.categoryId,
      note: input.note?.trim() || null,
      occurredAt: input.occurredAt ?? now,
    });
    await tx
      .update(schema.savingJars)
      .set({ balanceMinor: sql`${schema.savingJars.balanceMinor} + ${amountMinor}`, updatedAt: now })
      .where(eq(schema.savingJars.id, input.jarId));
  });
  refresh();
  return ok(amountMinor > 0 ? 'Contribution recorded.' : 'Withdrawal recorded.');
}

// ---------------------------------------------------------------------------
// Accounts (banking + credit cards)

export async function createAccount(input: {
  name: string;
  institution?: string;
  type: 'bank' | 'credit_card';
  balanceMinor: number;
  currency: string;
  creditLimitMinor?: number;
}): Promise<ActionResult> {
  const actor = await requireUser();
  const name = cleanText(input.name, 'Account name');
  if (typeof name !== 'string') return name;
  if (input.type !== 'bank' && input.type !== 'credit_card') {
    return fail('Account type must be "bank" or "credit_card".');
  }
  const balanceMinor = cleanAmountMinor(input.balanceMinor, 'Balance');
  if (typeof balanceMinor !== 'number') return balanceMinor;

  const db = await getDb();
  const now = Date.now();
  await db.insert(schema.accounts).values({
    id: newId(),
    tenantId: actor.tenantId,
    userId: actor.userId,
    name,
    institution: input.institution?.trim() || null,
    type: input.type,
    balanceMinor,
    currency: input.currency,
    creditLimitMinor: input.creditLimitMinor ?? null,
    createdAt: now,
    updatedAt: now,
  });
  refresh();
  return ok('Account added.');
}

export async function updateAccount(input: {
  accountId: string;
  name?: string;
  institution?: string;
  balanceMinor?: number;
  creditLimitMinor?: number;
}): Promise<ActionResult> {
  const actor = await requireUser();
  const patch: Partial<typeof schema.accounts.$inferInsert> & { updatedAt: number } = {
    updatedAt: Date.now(),
  };
  if (input.name !== undefined) {
    const name = cleanText(input.name, 'Account name');
    if (typeof name !== 'string') return name;
    patch.name = name;
  }
  if (input.institution !== undefined) patch.institution = input.institution.trim() || null;
  if (input.balanceMinor !== undefined) {
    const balanceMinor = cleanAmountMinor(input.balanceMinor, 'Balance');
    if (typeof balanceMinor !== 'number') return balanceMinor;
    patch.balanceMinor = balanceMinor;
  }
  if (input.creditLimitMinor !== undefined) patch.creditLimitMinor = input.creditLimitMinor;

  const db = await getDb();
  const updated = await db
    .update(schema.accounts)
    .set(patch)
    .where(and(eq(schema.accounts.id, input.accountId), eq(schema.accounts.userId, actor.userId)))
    .returning({ id: schema.accounts.id });
  if (updated.length === 0) return fail(NOT_FOUND_ACCOUNT);
  refresh();
  return ok('Account updated.');
}

export async function deleteAccount(input: { accountId: string }): Promise<ActionResult> {
  const actor = await requireUser();
  const db = await getDb();
  const deleted = await db
    .delete(schema.accounts)
    .where(and(eq(schema.accounts.id, input.accountId), eq(schema.accounts.userId, actor.userId)))
    .returning({ id: schema.accounts.id });
  if (deleted.length === 0) return fail(NOT_FOUND_ACCOUNT);
  refresh();
  return ok('Account removed.');
}

// ---------------------------------------------------------------------------
// Assets

export async function createAsset(input: {
  name: string;
  type: 'physical' | 'security';
  valueMinor: number;
  currency: string;
}): Promise<ActionResult> {
  const actor = await requireUser();
  const name = cleanText(input.name, 'Asset name');
  if (typeof name !== 'string') return name;
  if (input.type !== 'physical' && input.type !== 'security') {
    return fail('Asset type must be "physical" or "security".');
  }
  const valueMinor = cleanAmountMinor(input.valueMinor, 'Value');
  if (typeof valueMinor !== 'number') return valueMinor;

  const db = await getDb();
  const now = Date.now();
  await db.insert(schema.assets).values({
    id: newId(),
    tenantId: actor.tenantId,
    userId: actor.userId,
    name,
    type: input.type,
    valueMinor,
    currency: input.currency,
    createdAt: now,
    updatedAt: now,
  });
  refresh();
  return ok('Asset added.');
}

export async function updateAsset(input: {
  assetId: string;
  name?: string;
  valueMinor?: number;
}): Promise<ActionResult> {
  const actor = await requireUser();
  const patch: Partial<typeof schema.assets.$inferInsert> & { updatedAt: number } = {
    updatedAt: Date.now(),
  };
  if (input.name !== undefined) {
    const name = cleanText(input.name, 'Asset name');
    if (typeof name !== 'string') return name;
    patch.name = name;
  }
  if (input.valueMinor !== undefined) {
    const valueMinor = cleanAmountMinor(input.valueMinor, 'Value');
    if (typeof valueMinor !== 'number') return valueMinor;
    patch.valueMinor = valueMinor;
  }

  const db = await getDb();
  const updated = await db
    .update(schema.assets)
    .set(patch)
    .where(and(eq(schema.assets.id, input.assetId), eq(schema.assets.userId, actor.userId)))
    .returning({ id: schema.assets.id });
  if (updated.length === 0) return fail(NOT_FOUND_ASSET);
  refresh();
  return ok('Asset updated.');
}

export async function deleteAsset(input: { assetId: string }): Promise<ActionResult> {
  const actor = await requireUser();
  const db = await getDb();
  const deleted = await db
    .delete(schema.assets)
    .where(and(eq(schema.assets.id, input.assetId), eq(schema.assets.userId, actor.userId)))
    .returning({ id: schema.assets.id });
  if (deleted.length === 0) return fail(NOT_FOUND_ASSET);
  refresh();
  return ok('Asset removed.');
}

// ---------------------------------------------------------------------------
// Deposits

export async function createDeposit(input: {
  name: string;
  amountMinor: number;
  currency: string;
}): Promise<ActionResult> {
  const actor = await requireUser();
  const name = cleanText(input.name, 'Deposit name');
  if (typeof name !== 'string') return name;
  const amountMinor = cleanAmountMinor(input.amountMinor, 'Amount');
  if (typeof amountMinor !== 'number') return amountMinor;

  const db = await getDb();
  const now = Date.now();
  await db.insert(schema.deposits).values({
    id: newId(),
    tenantId: actor.tenantId,
    userId: actor.userId,
    name,
    amountMinor,
    currency: input.currency,
    createdAt: now,
    updatedAt: now,
  });
  refresh();
  return ok('Deposit added.');
}

export async function updateDeposit(input: {
  depositId: string;
  name?: string;
  amountMinor?: number;
}): Promise<ActionResult> {
  const actor = await requireUser();
  const patch: Partial<typeof schema.deposits.$inferInsert> & { updatedAt: number } = {
    updatedAt: Date.now(),
  };
  if (input.name !== undefined) {
    const name = cleanText(input.name, 'Deposit name');
    if (typeof name !== 'string') return name;
    patch.name = name;
  }
  if (input.amountMinor !== undefined) {
    const amountMinor = cleanAmountMinor(input.amountMinor, 'Amount');
    if (typeof amountMinor !== 'number') return amountMinor;
    patch.amountMinor = amountMinor;
  }

  const db = await getDb();
  const updated = await db
    .update(schema.deposits)
    .set(patch)
    .where(and(eq(schema.deposits.id, input.depositId), eq(schema.deposits.userId, actor.userId)))
    .returning({ id: schema.deposits.id });
  if (updated.length === 0) return fail(NOT_FOUND_DEPOSIT);
  refresh();
  return ok('Deposit updated.');
}

export async function deleteDeposit(input: { depositId: string }): Promise<ActionResult> {
  const actor = await requireUser();
  const db = await getDb();
  const deleted = await db
    .delete(schema.deposits)
    .where(and(eq(schema.deposits.id, input.depositId), eq(schema.deposits.userId, actor.userId)))
    .returning({ id: schema.deposits.id });
  if (deleted.length === 0) return fail(NOT_FOUND_DEPOSIT);
  refresh();
  return ok('Deposit removed.');
}

// ---------------------------------------------------------------------------
// Loans — creating one auto-creates its linked Fixed kind (see
// `LOANS_CATEGORY_NAME`'s doc comment); editing keeps the kind's name/
// budget in sync; deleting removes the kind too, never leaving an orphan.

export async function createLoan(input: {
  name: string;
  lender: string;
  principalMinor: number;
  remainingBalanceMinor: number;
  installmentAmountMinor: number;
  currency: string;
  startDate: string;
  endDate: string;
}): Promise<ActionResult> {
  const actor = await requireUser();
  const name = cleanText(input.name, 'Loan name');
  if (typeof name !== 'string') return name;
  const lender = cleanText(input.lender, 'Lender');
  if (typeof lender !== 'string') return lender;
  const principalMinor = cleanAmountMinor(input.principalMinor, 'Principal');
  if (typeof principalMinor !== 'number') return principalMinor;
  const remainingBalanceMinor = cleanAmountMinor(
    input.remainingBalanceMinor,
    'Remaining balance',
  );
  if (typeof remainingBalanceMinor !== 'number') return remainingBalanceMinor;
  const installmentAmountMinor = cleanAmountMinor(
    input.installmentAmountMinor,
    'Installment amount',
  );
  if (typeof installmentAmountMinor !== 'number') return installmentAmountMinor;
  if (!input.startDate || !input.endDate) return fail('Start and end dates are required.');

  const db = await getDb();
  const now = Date.now();
  await db.transaction(async (tx) => {
    const [existingCategory] = await tx
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(
        and(
          eq(schema.categories.userId, actor.userId),
          eq(schema.categories.type, 'fixed'),
          eq(schema.categories.name, LOANS_CATEGORY_NAME),
        ),
      );
    const categoryId = existingCategory?.id ?? newId();
    if (!existingCategory) {
      await tx.insert(schema.categories).values({
        id: categoryId,
        tenantId: actor.tenantId,
        userId: actor.userId,
        name: LOANS_CATEGORY_NAME,
        type: 'fixed',
        createdAt: now,
        updatedAt: now,
      });
    }

    const kindId = newId();
    await tx.insert(schema.kinds).values({
      id: kindId,
      tenantId: actor.tenantId,
      userId: actor.userId,
      categoryId,
      name,
      predictedAmountMinor: installmentAmountMinor,
      currency: input.currency,
      recurrenceIntervalUnit: null,
      recurrenceIntervalCount: null,
      recurrenceAnchorDate: null,
      createdAt: now,
      updatedAt: now,
    });

    await tx.insert(schema.loans).values({
      id: newId(),
      tenantId: actor.tenantId,
      userId: actor.userId,
      name,
      lender,
      principalMinor,
      remainingBalanceMinor,
      installmentAmountMinor,
      currency: input.currency,
      startDate: input.startDate,
      endDate: input.endDate,
      linkedKindId: kindId,
      createdAt: now,
      updatedAt: now,
    });
  });
  refresh();
  return ok('Loan added.');
}

export async function updateLoan(input: {
  loanId: string;
  name?: string;
  lender?: string;
  remainingBalanceMinor?: number;
  installmentAmountMinor?: number;
  endDate?: string;
}): Promise<ActionResult> {
  const actor = await requireUser();
  const db = await getDb();

  const [loan] = await db
    .select({ linkedKindId: schema.loans.linkedKindId })
    .from(schema.loans)
    .where(and(eq(schema.loans.id, input.loanId), eq(schema.loans.userId, actor.userId)));
  if (!loan) return fail(NOT_FOUND_LOAN);

  const now = Date.now();
  const loanPatch: Partial<typeof schema.loans.$inferInsert> & { updatedAt: number } = {
    updatedAt: now,
  };
  const kindPatch: Partial<typeof schema.kinds.$inferInsert> & { updatedAt: number } = {
    updatedAt: now,
  };
  let touchesKind = false;

  if (input.name !== undefined) {
    const name = cleanText(input.name, 'Loan name');
    if (typeof name !== 'string') return name;
    loanPatch.name = name;
    kindPatch.name = name;
    touchesKind = true;
  }
  if (input.lender !== undefined) {
    const lender = cleanText(input.lender, 'Lender');
    if (typeof lender !== 'string') return lender;
    loanPatch.lender = lender;
  }
  if (input.remainingBalanceMinor !== undefined) {
    const remainingBalanceMinor = cleanAmountMinor(
      input.remainingBalanceMinor,
      'Remaining balance',
    );
    if (typeof remainingBalanceMinor !== 'number') return remainingBalanceMinor;
    loanPatch.remainingBalanceMinor = remainingBalanceMinor;
  }
  if (input.installmentAmountMinor !== undefined) {
    const installmentAmountMinor = cleanAmountMinor(
      input.installmentAmountMinor,
      'Installment amount',
    );
    if (typeof installmentAmountMinor !== 'number') return installmentAmountMinor;
    loanPatch.installmentAmountMinor = installmentAmountMinor;
    kindPatch.predictedAmountMinor = installmentAmountMinor;
    touchesKind = true;
  }
  if (input.endDate !== undefined) loanPatch.endDate = input.endDate;

  await db.transaction(async (tx) => {
    await tx.update(schema.loans).set(loanPatch).where(eq(schema.loans.id, input.loanId));
    if (touchesKind) {
      await tx.update(schema.kinds).set(kindPatch).where(eq(schema.kinds.id, loan.linkedKindId));
    }
  });
  refresh();
  return ok('Loan updated.');
}

export async function deleteLoan(input: { loanId: string }): Promise<ActionResult> {
  const actor = await requireUser();
  const db = await getDb();

  const [loan] = await db
    .select({ linkedKindId: schema.loans.linkedKindId })
    .from(schema.loans)
    .where(and(eq(schema.loans.id, input.loanId), eq(schema.loans.userId, actor.userId)));
  if (!loan) return fail(NOT_FOUND_LOAN);

  await db.transaction(async (tx) => {
    // Loan row first — it's the side of the FK referencing the kind, so the
    // kind can't be deleted while a loan still points at it.
    await tx.delete(schema.loans).where(eq(schema.loans.id, input.loanId));
    await tx.delete(schema.kinds).where(eq(schema.kinds.id, loan.linkedKindId));
  });
  refresh();
  return ok('Loan removed.');
}

// ---------------------------------------------------------------------------
// People — a single signed ledger per person; `ledger_people_transactions`
// is append-only (no delete/update action), matching the schema's own
// documented convention for jar/people transaction rows.

export async function createPerson(input: {
  name: string;
  currency: string;
}): Promise<ActionResult> {
  const actor = await requireUser();
  const name = cleanText(input.name, 'Person name');
  if (typeof name !== 'string') return name;

  const db = await getDb();
  const now = Date.now();
  await db.insert(schema.people).values({
    id: newId(),
    tenantId: actor.tenantId,
    userId: actor.userId,
    name,
    balanceMinor: 0,
    currency: input.currency,
    createdAt: now,
    updatedAt: now,
  });
  refresh();
  return ok('Person added.');
}

export async function deletePerson(input: { personId: string }): Promise<ActionResult> {
  const actor = await requireUser();
  const db = await getDb();
  const deleted = await db
    .delete(schema.people)
    .where(and(eq(schema.people.id, input.personId), eq(schema.people.userId, actor.userId)))
    .returning({ id: schema.people.id });
  if (deleted.length === 0) return fail(NOT_FOUND_PERSON);
  refresh();
  return ok('Person removed.');
}

export async function createPeopleTransaction(input: {
  personId: string;
  amountMinor: number;
  note?: string;
  occurredAt?: number;
}): Promise<ActionResult> {
  const actor = await requireUser();
  const amountMinor = cleanSignedAmountMinor(input.amountMinor, 'Amount');
  if (typeof amountMinor !== 'number') return amountMinor;

  const db = await getDb();
  const [person] = await db
    .select({ id: schema.people.id })
    .from(schema.people)
    .where(and(eq(schema.people.id, input.personId), eq(schema.people.userId, actor.userId)));
  if (!person) return fail(NOT_FOUND_PERSON);

  const now = Date.now();
  await db.transaction(async (tx) => {
    await tx.insert(schema.peopleTransactions).values({
      id: newId(),
      tenantId: actor.tenantId,
      userId: actor.userId,
      personId: input.personId,
      amountMinor,
      note: input.note?.trim() || null,
      occurredAt: input.occurredAt ?? now,
    });
    await tx
      .update(schema.people)
      .set({ balanceMinor: sql`${schema.people.balanceMinor} + ${amountMinor}`, updatedAt: now })
      .where(eq(schema.people.id, input.personId));
  });
  refresh();
  return ok('Recorded.');
}

// ---------------------------------------------------------------------------
// Period reviews — `ledger_period_reviews` rows exist only for reviewed
// periods (SPEC.md's Data model correction #4), so "mark reviewed" is a
// plain insert; `onConflictDoNothing` on the primary key is what makes
// marking an already-reviewed period again a no-op instead of a thrown
// unique-constraint error (the L.8 review checklist's explicit idempotency
// requirement).

export async function markPeriodReviewed(input: {
  year: number;
  month: number;
}): Promise<ActionResult> {
  const actor = await requireUser();
  if (!Number.isInteger(input.year) || !Number.isInteger(input.month)) {
    return fail('Invalid period.');
  }
  const db = await getDb();
  await db
    .insert(schema.periodReviews)
    .values({
      tenantId: actor.tenantId,
      userId: actor.userId,
      year: input.year,
      month: input.month,
      reviewedAt: Date.now(),
    })
    .onConflictDoNothing({
      target: [schema.periodReviews.userId, schema.periodReviews.year, schema.periodReviews.month],
    });
  refresh();
  return ok('Marked as reviewed.');
}

// ---------------------------------------------------------------------------
// Read-only actions

export interface ExpenseFormKindOption {
  id: string;
  name: string;
  currency: string;
}

export interface ExpenseFormCategoryOption {
  id: string;
  name: string;
  kinds: ExpenseFormKindOption[];
}

export interface ExpenseFormJarOption {
  id: string;
  /** The jar's own saving category name (e.g. "Travel jar"). */
  name: string;
  balanceMinor: number;
  currency: string;
}

/**
 * The only read (not a mutation) in this file — every other action here
 * changes data. Needed because the "+ Add expense" trigger lives in
 * `LedgerSidebar`, shared shell chrome rendered identically from every page
 * (Overview, Budget, and eventually Accounts/Reports/Settings) rather than
 * a single page's own server component — there's no single data-fetching
 * pipeline to preload this into ahead of time the way Budget's own category
 * list is preloaded for itself. Fetched lazily, only when the dialog
 * actually opens, so pages that never open it never pay for this query.
 *
 * `jars` (L.12) backs the "fund from a saving jar" toggle's picker — a jar
 * with a zero balance is still included (its own withdrawal validation in
 * `createJarTransaction` is what actually blocks an over-large one),
 * consistent with every other picker in this app never pre-filtering
 * options on business-rule eligibility.
 */
export async function getExpenseFormOptions(): Promise<{
  categories: ExpenseFormCategoryOption[];
  jars: ExpenseFormJarOption[];
}> {
  const actor = await requireUser();
  const db = await getDb();
  const [categories, savingCategories, jars] = await Promise.all([
    listCategoriesWithKinds(db, actor.userId),
    listSavingCategoriesWithKinds(db, actor.userId),
    db.select().from(schema.savingJars).where(eq(schema.savingJars.userId, actor.userId)),
  ]);
  const savingCategoryByKindId = new Map(
    savingCategories.flatMap((category) => category.kinds.map((kind) => [kind.id, category] as const)),
  );
  return {
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      kinds: category.kinds.map((kind) => ({
        id: kind.id,
        name: kind.name,
        currency: kind.currency,
      })),
    })),
    jars: jars
      .map((jar) => {
        const category = savingCategoryByKindId.get(jar.kindId);
        if (!category) return null;
        return {
          id: jar.id,
          name: category.name,
          balanceMinor: jar.balanceMinor,
          currency: jar.currency,
        };
      })
      .filter((jar) => jar !== null),
  };
}
