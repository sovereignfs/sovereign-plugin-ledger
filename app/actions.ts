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
 * Dynamic and Fixed categories/kinds only in this task — saving-type
 * creation is deliberately rejected here (`createCategory`/`createKind`),
 * reserved for L.12's jar-auto-provisioning logic.
 */
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import * as schema from './_db/schema';
import { fail, ok, type ActionResult } from './_lib/action-result';
import { requireUser } from './_lib/authz';
import { getDb } from './_lib/db';
import { newId } from './_lib/ids';
import { listCategoriesWithKinds } from './_lib/queries';

const NOT_FOUND_CURRENCY = 'Currency not found.';
const NOT_FOUND_INCOME = 'Income not found.';
const NOT_FOUND_CATEGORY = 'Category not found.';
const NOT_FOUND_KIND = 'Kind not found.';
const NOT_FOUND_TRANSACTION = 'Transaction not found.';

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
  const deleted = await db
    .delete(schema.currencies)
    .where(
      and(eq(schema.currencies.id, input.currencyId), eq(schema.currencies.userId, actor.userId)),
    )
    .returning({ id: schema.currencies.id });
  if (deleted.length === 0) return fail(NOT_FOUND_CURRENCY);
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
 * (the setup wizard, L.4) that need to create both in the same gesture and
 * have no way to learn a plain `createCategory`'s new id back (actions
 * return only `ActionResult`, matching this app family's own convention of
 * never echoing created ids to the client). Not a replacement for the
 * separate `createCategory`/`createKind` below, which stay the lower-level
 * primitives for adding a kind to an already-existing category.
 */
export async function createCategoryWithKind(input: {
  name: string;
  type: 'dynamic' | 'fixed';
  predictedAmountMinor: number;
  currency: string;
}): Promise<ActionResult> {
  const actor = await requireUser();
  const name = cleanText(input.name, 'Category name');
  if (typeof name !== 'string') return name;
  if (input.type !== 'dynamic' && input.type !== 'fixed') {
    return fail("Saving categories aren't supported yet — coming in a later task.");
  }
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
    await tx.insert(schema.kinds).values({
      id: newId(),
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

/**
 * The only read (not a mutation) in this file — every other action here
 * changes data. Needed because the "+ Add expense" trigger lives in
 * `LedgerSidebar`, shared shell chrome rendered identically from every page
 * (Overview, Budget, and eventually Accounts/Reports/Settings) rather than
 * a single page's own server component — there's no single data-fetching
 * pipeline to preload this into ahead of time the way Budget's own category
 * list is preloaded for itself. Fetched lazily, only when the dialog
 * actually opens, so pages that never open it never pay for this query.
 */
export async function getExpenseFormOptions(): Promise<{
  categories: ExpenseFormCategoryOption[];
}> {
  const actor = await requireUser();
  const db = await getDb();
  const categories = await listCategoriesWithKinds(db, actor.userId);
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
  };
}
