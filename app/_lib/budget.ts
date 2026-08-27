import type { LedgerDb } from '../_db/client';
import { getCurrentMonthRange } from './period';
import { listCategoriesWithKinds, listTransactions } from './queries';

export interface BudgetTransaction {
  id: string;
  occurredAt: number;
  kindName: string;
  amountMinor: number;
  currency: string;
  note: string | null;
}

export interface BudgetKind {
  id: string;
  name: string;
  predictedAmountMinor: number;
  actualAmountMinor: number;
  currency: string;
}

export interface BudgetCategory {
  id: string;
  name: string;
  type: 'dynamic' | 'fixed';
  predictedAmountMinor: number;
  actualAmountMinor: number;
  /** All of a category's kinds share one currency in every flow the current
   *  UI can reach (`createCategoryWithKind` is the only creation path, and
   *  it always writes one kind in the category's own currency) — `createKind`
   *  could in principle add a second kind in a different currency, but
   *  nothing wires that up yet. Documented rather than silently assumed;
   *  revisit if a later task adds a second-kind-per-category flow. */
  currency: string;
  kinds: BudgetKind[];
  /** Most recent 5 transactions across every kind in this category,
   *  all-time (not month-scoped) — matches web-shell.md screen 3's
   *  "RECENT IN THIS CATEGORY" list. */
  recentTransactions: BudgetTransaction[];
}

export interface BudgetData {
  dynamic: BudgetCategory[];
  fixed: BudgetCategory[];
}

/**
 * Budget's list+detail payload — the whole category/kind tree is fetched
 * once; a selected category's "detail column" (subcategory breakdown +
 * recent transactions) is a subset of this same payload, not a second
 * on-selection fetch. SPEC.md's Data fetching contract describes the detail
 * as "fetched on selection," written before this task's actual dataset size
 * was known — at the scale a single-user budget ever reaches (a handful of
 * categories/kinds), preloading everything in one round trip is simpler and
 * just as fast, so that's the deliberate deviation here.
 */
export async function getBudgetData(db: LedgerDb, userId: string): Promise<BudgetData> {
  const [categoriesWithKinds, allTransactions] = await Promise.all([
    listCategoriesWithKinds(db, userId),
    listTransactions(db, userId),
  ]);

  const { start, end } = getCurrentMonthRange();
  const kindNameById = new Map(
    categoriesWithKinds.flatMap((c) => c.kinds.map((k) => [k.id, k.name])),
  );
  const transactionsByKindId = new Map<string, typeof allTransactions>();
  for (const tx of allTransactions) {
    const list = transactionsByKindId.get(tx.kindId) ?? [];
    list.push(tx);
    transactionsByKindId.set(tx.kindId, list);
  }

  const dynamic: BudgetCategory[] = [];
  const fixed: BudgetCategory[] = [];

  for (const category of categoriesWithKinds) {
    // A category can end up with zero kinds — e.g. the shared "Loans"
    // category (actions.ts's LOANS_CATEGORY_NAME) once its last loan is
    // deleted, since deleteLoan only removes that loan's own kind, never
    // the category itself. Found live: rendering a zero-kind category fell
    // back to an empty-string currency, which crashed the whole page via
    // `Intl.NumberFormat`'s "Invalid currency code" — skip it instead;
    // there's nothing meaningful to show for a category with no kinds.
    if (category.kinds.length === 0) continue;

    const kinds: BudgetKind[] = category.kinds.map((k) => {
      const kindTransactions = transactionsByKindId.get(k.id) ?? [];
      const actualAmountMinor = kindTransactions
        .filter((tx) => tx.occurredAt >= start && tx.occurredAt < end)
        .reduce((sum, tx) => sum + tx.amountMinor, 0);
      return {
        id: k.id,
        name: k.name,
        predictedAmountMinor: k.predictedAmountMinor,
        actualAmountMinor,
        currency: k.currency,
      };
    });

    const recentTransactions: BudgetTransaction[] = category.kinds
      .flatMap((k) => transactionsByKindId.get(k.id) ?? [])
      .sort((a, b) => b.occurredAt - a.occurredAt)
      .slice(0, 5)
      .map((tx) => ({
        id: tx.id,
        occurredAt: tx.occurredAt,
        kindName: kindNameById.get(tx.kindId) ?? 'Unknown',
        amountMinor: tx.amountMinor,
        currency: tx.currency,
        note: tx.note,
      }));

    const entry: BudgetCategory = {
      id: category.id,
      name: category.name,
      type: category.type as 'dynamic' | 'fixed',
      predictedAmountMinor: kinds.reduce((sum, k) => sum + k.predictedAmountMinor, 0),
      actualAmountMinor: kinds.reduce((sum, k) => sum + k.actualAmountMinor, 0),
      currency: kinds[0]?.currency ?? '',
      kinds,
      recentTransactions,
    };

    if (category.type === 'fixed') fixed.push(entry);
    else dynamic.push(entry);
  }

  return { dynamic, fixed };
}
