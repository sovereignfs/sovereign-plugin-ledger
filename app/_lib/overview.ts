import { eq } from 'drizzle-orm';
import type { LedgerDb } from '../_db/client';
import * as schema from '../_db/schema';
import { getNetWorth } from './accounts';
import { mergeUnconverted, sumConvertedToBaseDetailed } from './money';
import { getCurrentMonthRange, getUtcYearMonth } from './period';
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
  /** True for a row whose section has no task shipped yet at all — rendered
   *  as a disabled "coming soon" row. Every current checklist row maps to a
   *  shipped section, so this is always `false` today; kept as a generic
   *  mechanism for whatever future row needs it next. */
  comingSoon: boolean;
}

export interface TopCategory {
  categoryId: string;
  name: string;
  predictedAmountMinor: number;
  actualAmountMinor: number;
  /** Every kind in a category shares one currency (enforced by `createKind`). */
  currency: string;
}

export interface RecentActivityItem {
  id: string;
  occurredAt: number;
  /** A regular expense against a budgeted kind, or a withdrawal funded from a saving jar. */
  source: 'expense' | 'jar';
  categoryName: string;
  kindName: string;
  amountMinor: number;
  currency: string;
  note: string | null;
}

export interface OverviewData {
  baseCurrencyCode: string;
  /** The UTC month every "this month" figure is scoped to — passed down so
   *  the label renders from server data, never from a client-side
   *  `new Date()` that could disagree with the server near a boundary. */
  period: { year: number; month: number };
  /** All-time count — the signal this task uses to decide checklist vs.
   *  populated dashboard (see OverviewView.tsx's own doc comment for why). */
  transactionCount: number;
  thisMonth: {
    incomeMinor: number;
    spentMinor: number;
    budgetedMinor: number;
    /** Income minus everything budgeted — the same definition Reports uses. */
    projectedSavingsMinor: number;
    /** Income minus what's been spent so far this month. */
    remainingMinor: number;
  };
  netWorth: { totalMinor: number };
  savingJars: { totalMinor: number; jarCount: number };
  /** CONCEPT.md's "mini overviews": card utilisation and what's left on loans. */
  creditCards: { balanceMinor: number; limitMinor: number; count: number };
  loans: { remainingMinor: number; count: number };
  /** Currencies excluded from any base-currency total above for lack of a rate. */
  unconvertedCurrencies: string[];
  topCategories: TopCategory[];
  recentActivity: RecentActivityItem[];
  checklist: OverviewChecklistItem[];
}

/**
 * Overview's one-round-trip payload (SPEC.md's Data fetching contract).
 * Net worth is `getNetWorth` (accounts.ts) — shared with Accounts' own
 * payload rather than a second, independently-maintained copy of the same
 * math.
 */
export async function getOverviewData(
  db: LedgerDb,
  userId: string,
  now: number = Date.now(),
): Promise<OverviewData> {
  const [
    currencies,
    incomes,
    categoriesWithKinds,
    categoryRows,
    jars,
    accounts,
    assetRows,
    depositRows,
    loanRows,
    peopleRows,
  ] = await Promise.all([
    db.select().from(schema.currencies).where(eq(schema.currencies.userId, userId)),
    db.select().from(schema.incomes).where(eq(schema.incomes.userId, userId)),
    listCategoriesWithKinds(db, userId),
    db
      .select({ id: schema.categories.id, name: schema.categories.name })
      .from(schema.categories)
      .where(eq(schema.categories.userId, userId)),
    db.select().from(schema.savingJars).where(eq(schema.savingJars.userId, userId)),
    db.select().from(schema.accounts).where(eq(schema.accounts.userId, userId)),
    db.select({ id: schema.assets.id }).from(schema.assets).where(eq(schema.assets.userId, userId)),
    db
      .select({ id: schema.deposits.id })
      .from(schema.deposits)
      .where(eq(schema.deposits.userId, userId)),
    db.select().from(schema.loans).where(eq(schema.loans.userId, userId)),
    db.select({ id: schema.people.id }).from(schema.people).where(eq(schema.people.userId, userId)),
  ]);
  const creditCards = accounts.filter((a) => a.type === 'credit_card');
  const bankingCount = accounts.length - creditCards.length;

  const baseCurrencyCode =
    currencies.find((c) => c.isBase === 1)?.code ?? currencies[0]?.code ?? '';
  const { start, end } = getCurrentMonthRange(now);
  const [transactionsThisMonth, allTransactions, jarWithdrawalsThisMonth, netWorth] =
    await Promise.all([
      listTransactionsInRange(db, userId, start, end),
      db
        .select({ id: schema.transactions.id })
        .from(schema.transactions)
        .where(eq(schema.transactions.userId, userId)),
      db
        .select({
          id: schema.jarTransactions.id,
          occurredAt: schema.jarTransactions.occurredAt,
          amountMinor: schema.jarTransactions.amountMinor,
          note: schema.jarTransactions.note,
          categoryId: schema.jarTransactions.categoryId,
          currency: schema.savingJars.currency,
        })
        .from(schema.jarTransactions)
        .innerJoin(schema.savingJars, eq(schema.savingJars.id, schema.jarTransactions.jarId))
        .where(eq(schema.jarTransactions.userId, userId)),
      getNetWorth(db, userId, baseCurrencyCode),
    ]);

  const incomeSum = await sumConvertedToBaseDetailed(db, incomes, baseCurrencyCode);
  const spentSum = await sumConvertedToBaseDetailed(db, transactionsThisMonth, baseCurrencyCode);
  const budgetedSum = await sumConvertedToBaseDetailed(
    db,
    categoriesWithKinds.flatMap((c) =>
      c.kinds.map((k) => ({ amountMinor: k.predictedAmountMinor, currency: k.currency })),
    ),
    baseCurrencyCode,
  );
  const jarsSum = await sumConvertedToBaseDetailed(
    db,
    jars.map((j) => ({ amountMinor: j.balanceMinor, currency: j.currency })),
    baseCurrencyCode,
  );
  const cardBalanceSum = await sumConvertedToBaseDetailed(
    db,
    creditCards.map((a) => ({ amountMinor: a.balanceMinor, currency: a.currency })),
    baseCurrencyCode,
  );
  const cardLimitSum = await sumConvertedToBaseDetailed(
    db,
    creditCards
      .filter((a) => a.creditLimitMinor !== null)
      .map((a) => ({ amountMinor: a.creditLimitMinor ?? 0, currency: a.currency })),
    baseCurrencyCode,
  );
  const loansSum = await sumConvertedToBaseDetailed(
    db,
    loanRows.map((l) => ({ amountMinor: l.remainingBalanceMinor, currency: l.currency })),
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
  const categoryNameById = new Map(categoryRows.map((c) => [c.id, c.name]));
  const expenseActivity: RecentActivityItem[] = transactionsThisMonth.map((tx) => {
    const kind = kindById.get(tx.kindId);
    const categoryName = kind ? categoryNameById.get(kind.categoryId) : undefined;
    return {
      id: tx.id,
      occurredAt: tx.occurredAt,
      source: 'expense',
      categoryName: categoryName ?? 'Unknown',
      kindName: kind?.name ?? 'Unknown',
      amountMinor: tx.amountMinor,
      currency: tx.currency,
      note: tx.note,
    };
  });
  // A jar-funded expense is a withdrawal row, never a `ledger_transactions`
  // row — it still belongs in "what did I spend recently" (the schema
  // carries `category_id` on jar transactions for exactly this).
  const jarActivity: RecentActivityItem[] = jarWithdrawalsThisMonth
    .filter((tx) => tx.amountMinor < 0 && tx.occurredAt >= start && tx.occurredAt < end)
    .map((tx) => ({
      id: tx.id,
      occurredAt: tx.occurredAt,
      source: 'jar',
      categoryName: (tx.categoryId && categoryNameById.get(tx.categoryId)) || 'Saving jar',
      kindName: 'from jar',
      amountMinor: -tx.amountMinor,
      currency: tx.currency,
      note: tx.note,
    }));
  const recentActivity = [...expenseActivity, ...jarActivity]
    .sort((a, b) => b.occurredAt - a.occurredAt)
    .slice(0, 5);

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
      detail:
        jars.length > 0
          ? `${jars.length} jar${jars.length === 1 ? '' : 's'}`
          : 'Set aside money for goals',
      done: jars.length > 0,
      href: jars.length > 0 ? undefined : '/ledger/budget',
      comingSoon: false,
    },
    accountsRow('bank-accounts', 'Bank accounts', bankingCount, 'account'),
    accountsRow('credit-cards', 'Credit cards', creditCards.length, 'card'),
    accountsRow('assets', 'Investments & assets', assetRows.length, 'item'),
    accountsRow('deposits', 'Deposits', depositRows.length, 'deposit'),
    accountsRow('loans', 'Loans', loanRows.length, 'loan'),
    accountsRow('people', 'People (money owed)', peopleRows.length, 'person'),
  ];

  return {
    baseCurrencyCode,
    period: getUtcYearMonth(now),
    transactionCount: allTransactions.length,
    thisMonth: {
      incomeMinor: incomeSum.totalMinor,
      spentMinor: spentSum.totalMinor,
      budgetedMinor: budgetedSum.totalMinor,
      projectedSavingsMinor: incomeSum.totalMinor - budgetedSum.totalMinor,
      remainingMinor: incomeSum.totalMinor - spentSum.totalMinor,
    },
    netWorth: { totalMinor: netWorth.netWorthMinor },
    savingJars: { totalMinor: jarsSum.totalMinor, jarCount: jars.length },
    creditCards: {
      balanceMinor: cardBalanceSum.totalMinor,
      limitMinor: cardLimitSum.totalMinor,
      count: creditCards.length,
    },
    loans: { remainingMinor: loansSum.totalMinor, count: loanRows.length },
    unconvertedCurrencies: mergeUnconverted(
      incomeSum,
      spentSum,
      budgetedSum,
      jarsSum,
      cardBalanceSum,
      cardLimitSum,
      loansSum,
      netWorth,
    ),
    topCategories,
    recentActivity,
    checklist,
  };
}
