import { and, desc, eq, ne } from 'drizzle-orm';
import type { LedgerDb } from '../_db/client';
import * as schema from '../_db/schema';

export async function listCurrencies(db: LedgerDb, userId: string) {
  return db.select().from(schema.currencies).where(eq(schema.currencies.userId, userId));
}

export async function listIncomes(db: LedgerDb, userId: string) {
  return db.select().from(schema.incomes).where(eq(schema.incomes.userId, userId));
}

export type CategoryRow = typeof schema.categories.$inferSelect;
export type KindRow = typeof schema.kinds.$inferSelect;
export type CategoryWithKinds = CategoryRow & { kinds: KindRow[] };

/**
 * Dynamic + Fixed categories only — saving-type categories can't exist yet
 * (creating one is rejected by `createCategory`, reserved for L.12), but
 * this filters defensively anyway rather than assuming that invariant holds
 * forever.
 */
export async function listCategoriesWithKinds(
  db: LedgerDb,
  userId: string,
): Promise<CategoryWithKinds[]> {
  const categories = await db
    .select()
    .from(schema.categories)
    .where(and(eq(schema.categories.userId, userId), ne(schema.categories.type, 'saving')));
  const kinds = await db.select().from(schema.kinds).where(eq(schema.kinds.userId, userId));

  const kindsByCategory = new Map<string, KindRow[]>();
  for (const kind of kinds) {
    const list = kindsByCategory.get(kind.categoryId) ?? [];
    list.push(kind);
    kindsByCategory.set(kind.categoryId, list);
  }
  return categories.map((category) => ({
    ...category,
    kinds: kindsByCategory.get(category.id) ?? [],
  }));
}

/** All of the caller's transactions, most recent first — e.g. a "recent activity" feed. */
export async function listTransactions(db: LedgerDb, userId: string) {
  return db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.userId, userId))
    .orderBy(desc(schema.transactions.occurredAt));
}

/** A single kind's own transactions, most recent first — e.g. a Budget detail column. */
export async function listTransactionsForKind(db: LedgerDb, userId: string, kindId: string) {
  return db
    .select()
    .from(schema.transactions)
    .where(and(eq(schema.transactions.userId, userId), eq(schema.transactions.kindId, kindId)))
    .orderBy(desc(schema.transactions.occurredAt));
}
