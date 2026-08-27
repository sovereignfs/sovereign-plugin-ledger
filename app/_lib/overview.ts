import { eq } from 'drizzle-orm';
import type { LedgerDb } from '../_db/client';
import * as schema from '../_db/schema';
import { getNetWorthMinor } from './accounts';
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
  /** A pending row with a real destination to link to. False for a done
   *  row (nothing to navigate to) and for a row whose section has no
   *  shipped page at all yet (rendered disabled, never a dead link). */
  href?: string;
  /** True only for a row whose section has no task shipped yet — Saving
   *  plans (L.12). Rendered as a disabled "coming soon" row. */
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
 * Net worth is `getNetWorthMinor` (accounts.ts) — shared with Accounts'
 * own payload rather than a second, independently-maintained copy of the
 * same math. Saving jars total is a real (currently zero) aggregate
 * against `ledger_saving_jars` — L.12 hasn't shipped, so nothing can
 * insert a row into it yet, not a placeholder value.
 */
export async function getOverviewData(db: LedgerDb, userId: string): Promise<OverviewData> {
  const [currencies, incomes, categoriesWithKinds, jars, accounts, assetRows, depositRows, loanRows, peopleRows] =
    await Promise.all([
      db.select().from(schema.currencies).where(eq(schema.currencies.userId, userId)),
      db.select().from(schema.incomes).where(eq(schema.incomes.userId, userId)),
      listCategoriesWithKinds(db, userId),
      db.select().from(schema.savingJars).where(eq(schema.savingJars.userId, userId)),
      db
        .select({ id: schema.accounts.id, type: schema.accounts.type })
        .from(schema.accounts)
        .where(eq(schema.accounts.userId, userId)),
      db
        .select({ id: schema.assets.id })
        .from(schema.assets)
        .where(eq(schema.assets.userId, userId)),
      db
        .select({ id: schema.deposits.id })
        .from(schema.deposits)
        .where(eq(schema.deposits.userId, userId)),
      db.select({ id: schema.loans.id }).from(schema.loans).where(eq(schema.loans.userId, userId)),
      db
        .select({ id: schema.people.id })
        .from(schema.people)
        .where(eq(schema.people.userId, userId)),
    ]);
  const bankingCount = accounts.filter((a) => a.type === 'bank').length;
  const creditCardCount = accounts.filter((a) => a.type === 'credit_card').length;

  const baseCurrencyCode =
    currencies.find((c) => c.isBase === 1)?.code ?? currencies[0]?.code ?? '';
  const { start, end } = getCurrentMonthRange();
  const [transactionsThisMonth, allTransactions, netWorthMinor] = await Promise.all([
    listTransactionsInRange(db, userId, start, end),
    db
      .select({ id: schema.transactions.id })
      .from(schema.transactions)
      .where(eq(schema.transactions.userId, userId)),
    getNetWorthMinor(db, userId, baseCurrencyCode),
  ]);

  const incomeMinor = await sumConvertedToBase(db, incomes, baseCurrencyCode);
  const spentMinor = await sumConvertedToBase(db, transactionsThisMonth, baseCurrencyCode);
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
    // A category can have zero kinds (e.g. the shared "Loans" category
    // once its last loan is deleted — see budget.ts's matching filter);
    // nothing meaningful to show for it here either.
    .filter((category) => category.kinds.length > 0)
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

  function accountsRow(
    key: string,
    label: string,
    count: number,
    noun: string,
  ): OverviewChecklistItem {
    const done = count > 0;
    return {
      key,
      label,
      detail: done ? `${count} ${noun}${count === 1 ? '' : 's'}` : undefined,
      done,
      href: done ? undefined : '/ledger/accounts',
      comingSoon: false,
    };
  }

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
    accountsRow('bank-accounts', 'Bank accounts', bankingCount, 'account'),
    accountsRow('credit-cards', 'Credit cards', creditCardCount, 'card'),
    accountsRow('assets', 'Investments & assets', assetRows.length, 'item'),
    accountsRow('deposits', 'Deposits', depositRows.length, 'deposit'),
    accountsRow('loans', 'Loans', loanRows.length, 'loan'),
    accountsRow('people', 'People (money owed)', peopleRows.length, 'person'),
  ];

  return {
    baseCurrencyCode,
    transactionCount: allTransactions.length,
    thisMonth: {
      incomeMinor,
      spentMinor,
      projectedSavedMinor: incomeMinor - spentMinor,
    },
    netWorth: { totalMinor: netWorthMinor },
    savingJars: { totalMinor: savingJarsMinor, jarCount: jars.length },
    topCategories,
    recentActivity,
    checklist,
  };
}
