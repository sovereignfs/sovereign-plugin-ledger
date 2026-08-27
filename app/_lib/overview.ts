import { eq } from 'drizzle-orm';
import type { LedgerDb } from '../_db/client';
import * as schema from '../_db/schema';
import { sumConvertedToBase } from './money';
import { getCurrentMonthRange } from './period';
import { listCategoriesWithKinds, listTransactionsInRange } from './queries';

export interface OverviewChecklistItem {
  key: string;
  label: string;
  /** Shown next to the label — counts/summary for a done row, a short
   *  description for a not-yet-buildable one. Omitted otherwise. */
  detail?: string;
  done: boolean;
  /** True for a row whose section has no task shipped yet (accounts, jars,
   *  etc.) — rendered as a disabled "coming soon" row, never a dead link. */
  comingSoon: boolean;
}

export interface TopCategory {
  categoryId: string;
  name: string;
  predictedAmountMinor: number;
  actualAmountMinor: number;
  /** All of a category's kinds share one currency in every reachable
   *  current flow (see budget.ts) — same assumption here. */
  currency: string;
}

export interface RecentActivityItem {
  id: string;
  occurredAt: number;
  categoryName: string;
  kindName: string;
  amountMinor: number;
  currency: string;
  note: string | null;
}

export interface OverviewData {
  baseCurrencyCode: string;
  /** All-time count — the signal this task uses to decide checklist vs.
   *  populated dashboard (see OverviewView.tsx's own doc comment for why). */
  transactionCount: number;
  thisMonth: { incomeMinor: number; spentMinor: number; projectedSavedMinor: number };
  netWorth: { totalMinor: number };
  savingJars: { totalMinor: number; jarCount: number };
  topCategories: TopCategory[];
  recentActivity: RecentActivityItem[];
  checklist: OverviewChecklistItem[];
}

/**
 * Overview's one-round-trip payload (SPEC.md's Data fetching contract).
 * Net worth and saving jars total are real aggregates against
 * `ledger_accounts`/`ledger_assets`/`ledger_deposits`/`ledger_loans`/
 * `ledger_saving_jars` — genuinely zero right now (L.7/L.12 haven't shipped,
 * so nothing can insert a row into any of them yet), not a placeholder
 * value. Once those tasks ship, these numbers start reflecting real data
 * with no change needed here.
 */
export async function getOverviewData(db: LedgerDb, userId: string): Promise<OverviewData> {
  const [currencies, incomes, categoriesWithKinds, accounts, assets, deposits, loans, jars] =
    await Promise.all([
      db.select().from(schema.currencies).where(eq(schema.currencies.userId, userId)),
      db.select().from(schema.incomes).where(eq(schema.incomes.userId, userId)),
      listCategoriesWithKinds(db, userId),
      db.select().from(schema.accounts).where(eq(schema.accounts.userId, userId)),
      db.select().from(schema.assets).where(eq(schema.assets.userId, userId)),
      db.select().from(schema.deposits).where(eq(schema.deposits.userId, userId)),
      db.select().from(schema.loans).where(eq(schema.loans.userId, userId)),
      db.select().from(schema.savingJars).where(eq(schema.savingJars.userId, userId)),
    ]);

  const baseCurrencyCode =
    currencies.find((c) => c.isBase === 1)?.code ?? currencies[0]?.code ?? '';
  const { start, end } = getCurrentMonthRange();
  const [transactionsThisMonth, allTransactions] = await Promise.all([
    listTransactionsInRange(db, userId, start, end),
    db
      .select({ id: schema.transactions.id })
      .from(schema.transactions)
      .where(eq(schema.transactions.userId, userId)),
  ]);

  const incomeMinor = await sumConvertedToBase(db, incomes, baseCurrencyCode);
  const spentMinor = await sumConvertedToBase(db, transactionsThisMonth, baseCurrencyCode);

  const bankBalances = accounts.filter((a) => a.type === 'bank');
  const creditCardBalances = accounts.filter((a) => a.type === 'credit_card');
  const assetsMinor = await sumConvertedToBase(
    db,
    [
      ...bankBalances.map((a) => ({ amountMinor: a.balanceMinor, currency: a.currency })),
      ...assets.map((a) => ({ amountMinor: a.valueMinor, currency: a.currency })),
      ...deposits.map((d) => ({ amountMinor: d.amountMinor, currency: d.currency })),
    ],
    baseCurrencyCode,
  );
  const liabilitiesMinor = await sumConvertedToBase(
    db,
    [
      ...creditCardBalances.map((a) => ({ amountMinor: a.balanceMinor, currency: a.currency })),
      ...loans.map((l) => ({ amountMinor: l.remainingBalanceMinor, currency: l.currency })),
    ],
    baseCurrencyCode,
  );
  const savingJarsMinor = await sumConvertedToBase(
    db,
    jars.map((j) => ({ amountMinor: j.balanceMinor, currency: j.currency })),
    baseCurrencyCode,
  );

  const spentByKindId = new Map<string, number>();
  for (const tx of transactionsThisMonth) {
    spentByKindId.set(tx.kindId, (spentByKindId.get(tx.kindId) ?? 0) + tx.amountMinor);
  }

  const topCategories: TopCategory[] = categoriesWithKinds
    .map((category) => {
      const predictedAmountMinor = category.kinds.reduce(
        (sum, k) => sum + k.predictedAmountMinor,
        0,
      );
      const actualAmountMinor = category.kinds.reduce(
        (sum, k) => sum + (spentByKindId.get(k.id) ?? 0),
        0,
      );
      return {
        categoryId: category.id,
        name: category.name,
        predictedAmountMinor,
        actualAmountMinor,
        currency: category.kinds[0]?.currency ?? baseCurrencyCode,
      };
    })
    .sort((a, b) => b.predictedAmountMinor - a.predictedAmountMinor)
    .slice(0, 5);

  const kindById = new Map(categoriesWithKinds.flatMap((c) => c.kinds.map((k) => [k.id, k])));
  const categoryById = new Map(categoriesWithKinds.map((c) => [c.id, c]));
  const recentActivity: RecentActivityItem[] = transactionsThisMonth.slice(0, 5).map((tx) => {
    const kind = kindById.get(tx.kindId);
    const category = kind ? categoryById.get(kind.categoryId) : undefined;
    return {
      id: tx.id,
      occurredAt: tx.occurredAt,
      categoryName: category?.name ?? 'Unknown',
      kindName: kind?.name ?? 'Unknown',
      amountMinor: tx.amountMinor,
      currency: tx.currency,
      note: tx.note,
    };
  });

  const secondaryIncomeCount = incomes.filter((i) => i.kind === 'secondary').length;
  const dynamicCount = categoriesWithKinds.filter((c) => c.type === 'dynamic').length;
  const fixedCount = categoriesWithKinds.filter((c) => c.type === 'fixed').length;

  const checklist: OverviewChecklistItem[] = [
    {
      key: 'currency-incomes',
      label: 'Base currency & incomes',
      detail: `${baseCurrencyCode} • Primary${secondaryIncomeCount > 0 ? ` + ${secondaryIncomeCount} secondary` : ''}`,
      done: true,
      comingSoon: false,
    },
    {
      key: 'expense-categories',
      label: 'Expense categories',
      detail: `${dynamicCount} dynamic, ${fixedCount} fixed`,
      done: true,
      comingSoon: false,
    },
    {
      key: 'saving-plans',
      label: 'Saving plans',
      detail: 'Set aside money for goals',
      done: false,
      comingSoon: true,
    },
    { key: 'bank-accounts', label: 'Bank accounts', done: false, comingSoon: true },
    { key: 'credit-cards', label: 'Credit cards', done: false, comingSoon: true },
    { key: 'assets', label: 'Investments & assets', done: false, comingSoon: true },
    { key: 'deposits', label: 'Deposits', done: false, comingSoon: true },
    { key: 'loans', label: 'Loans', done: false, comingSoon: true },
    { key: 'people', label: 'People (money owed)', done: false, comingSoon: true },
  ];

  return {
    baseCurrencyCode,
    transactionCount: allTransactions.length,
    thisMonth: {
      incomeMinor,
      spentMinor,
      projectedSavedMinor: incomeMinor - spentMinor,
    },
    netWorth: { totalMinor: assetsMinor - liabilitiesMinor },
    savingJars: { totalMinor: savingJarsMinor, jarCount: jars.length },
    topCategories,
    recentActivity,
    checklist,
  };
}
