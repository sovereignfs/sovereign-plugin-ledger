import { eq } from 'drizzle-orm';
import type { LedgerDb } from '../_db/client';
import * as schema from '../_db/schema';
import { loadRateLookup, type RateLookup } from '../_db/fx-rates';
import { mergeUnconverted, sumConvertedToBaseDetailed } from './money';

/**
 * A loan's remaining balance as it is shown and as it counts against net
 * worth. `actions.ts`'s `adjustLinkedLoanBalance` stores the exact
 * arithmetic result so that logging, editing and deleting a payment stay
 * reversible, which means an overpaid loan can hold a negative remaining
 * balance. Nothing owes the lender less than nothing, so the figure is
 * floored here — at the read edge — never in storage.
 */
export function clampRemaining(remainingBalanceMinor: number): number {
  return Math.max(0, remainingBalanceMinor);
}

export interface NetWorth {
  netWorthMinor: number;
  /** Currencies left out of the total for lack of a rate — see `ConvertedSum`. */
  unconvertedCurrencies: string[];
}

/**
 * Net worth = assets (bank balances + assets + deposits) minus liabilities
 * (credit card balances + loans' remaining balance), all converted to the
 * base currency. Exported separately from `getAccountsData` so Overview's
 * summary card computes the exact same number rather than a second,
 * independently-maintained copy of this math.
 */
/**
 * The rows net worth is computed from. Taken as a parameter so a caller that
 * has already fetched them — both `getAccountsData` and `getOverviewData` do —
 * does not fetch the same five tables a second time just to get this number.
 */
export interface NetWorthSource {
  accounts: Array<{ type: string; balanceMinor: number; currency: string }>;
  assets: Array<{ valueMinor: number; currency: string }>;
  deposits: Array<{ amountMinor: number; currency: string }>;
  loans: Array<{ remainingBalanceMinor: number; currency: string }>;
  /** Signed: positive = owed to the user, negative = owed by them. */
  people: Array<{ balanceMinor: number; currency: string }>;
}

/** Every currency `computeNetWorth` could need a rate for, for `loadRateLookup`. */
export function netWorthCurrencies(source: NetWorthSource): string[] {
  return [
    ...source.accounts.map((a) => a.currency),
    ...source.assets.map((a) => a.currency),
    ...source.deposits.map((d) => d.currency),
    ...source.loans.map((l) => l.currency),
    ...source.people.map((p) => p.currency),
  ];
}

/**
 * Net worth from rows the caller already holds.
 *
 * **People are part of it** (CONCEPT.md §3: "accounts, cards, stock/assets,
 * deposits, loans, people"). They were missing, so an informal debt or credit
 * — a whole section of the Accounts screen — counted for nothing in the
 * headline figure. `ledger_people.balance` is signed, so it contributes in
 * whichever direction it already points: money owed to the user is an asset,
 * money they owe is a liability, no branch needed.
 *
 * **Saving jars are deliberately excluded.** A jar holds money that is also
 * sitting in one of the accounts above — counting both would double it —
 * and CONCEPT.md's own net-worth definition does not list jars. Overview
 * shows the jar total as its own card instead.
 */
export async function computeNetWorth(
  db: LedgerDb,
  baseCurrencyCode: string,
  source: NetWorthSource,
  lookup?: RateLookup,
): Promise<NetWorth> {
  const rates =
    lookup ?? (await loadRateLookup(db, [baseCurrencyCode, ...netWorthCurrencies(source)]));

  const assetsSum = await sumConvertedToBaseDetailed(
    db,
    [
      ...source.accounts
        .filter((a) => a.type === 'bank')
        .map((a) => ({ amountMinor: a.balanceMinor, currency: a.currency })),
      ...source.assets.map((a) => ({ amountMinor: a.valueMinor, currency: a.currency })),
      ...source.deposits.map((d) => ({ amountMinor: d.amountMinor, currency: d.currency })),
      ...source.people.map((p) => ({ amountMinor: p.balanceMinor, currency: p.currency })),
    ],
    baseCurrencyCode,
    rates,
  );
  const liabilitiesSum = await sumConvertedToBaseDetailed(
    db,
    [
      ...source.accounts
        .filter((a) => a.type === 'credit_card')
        .map((a) => ({ amountMinor: a.balanceMinor, currency: a.currency })),
      ...source.loans.map((l) => ({
        amountMinor: clampRemaining(l.remainingBalanceMinor),
        currency: l.currency,
      })),
    ],
    baseCurrencyCode,
    rates,
  );
  return {
    netWorthMinor: assetsSum.totalMinor - liabilitiesSum.totalMinor,
    unconvertedCurrencies: mergeUnconverted(assetsSum, liabilitiesSum),
  };
}

/** `computeNetWorth` for a caller that does not already hold the rows. */
export async function getNetWorth(
  db: LedgerDb,
  userId: string,
  baseCurrencyCode: string,
  lookup?: RateLookup,
): Promise<NetWorth> {
  const [accounts, assets, deposits, loans, people] = await Promise.all([
    db.select().from(schema.accounts).where(eq(schema.accounts.userId, userId)),
    db.select().from(schema.assets).where(eq(schema.assets.userId, userId)),
    db.select().from(schema.deposits).where(eq(schema.deposits.userId, userId)),
    db.select().from(schema.loans).where(eq(schema.loans.userId, userId)),
    db.select().from(schema.people).where(eq(schema.people.userId, userId)),
  ]);
  return computeNetWorth(
    db,
    baseCurrencyCode,
    { accounts, assets, deposits, loans, people },
    lookup,
  );
}

export interface AccountItem {
  id: string;
  name: string;
  institution: string | null;
  type: 'bank' | 'credit_card';
  balanceMinor: number;
  currency: string;
  creditLimitMinor: number | null;
}

export interface AssetItem {
  id: string;
  name: string;
  type: 'physical' | 'security';
  valueMinor: number;
  currency: string;
}

export interface DepositItem {
  id: string;
  name: string;
  amountMinor: number;
  currency: string;
}

export interface LoanItem {
  id: string;
  name: string;
  lender: string;
  principalMinor: number;
  remainingBalanceMinor: number;
  installmentAmountMinor: number;
  currency: string;
  startDate: string;
  endDate: string;
  linkedKindId: string;
}

export interface PersonTransactionItem {
  id: string;
  amountMinor: number;
  note: string | null;
  occurredAt: number;
}

export interface PersonItem {
  id: string;
  name: string;
  balanceMinor: number;
  currency: string;
  /** Most recent first — "a person's ledger" (web-shell.md screen 4). */
  transactions: PersonTransactionItem[];
}

export interface AccountsData {
  baseCurrencyCode: string;
  netWorthMinor: number;
  /** Currencies excluded from `netWorthMinor` for lack of an exchange rate. */
  unconvertedCurrencies: string[];
  banking: AccountItem[];
  creditCards: AccountItem[];
  assets: AssetItem[];
  deposits: DepositItem[];
  loans: LoanItem[];
  people: PersonItem[];
}

/**
 * Accounts' one-round-trip payload — every entity type's rows, plus each
 * person's full transaction history preloaded (same "everything upfront,
 * not fetched on selection" choice L.5's Budget page made, for the same
 * reason: a real single-user dataset here is small).
 */
export async function getAccountsData(db: LedgerDb, userId: string): Promise<AccountsData> {
  const [currencies, accountRows, assetRows, depositRows, loanRows, peopleRows, peopleTxRows] =
    await Promise.all([
      db.select().from(schema.currencies).where(eq(schema.currencies.userId, userId)),
      db.select().from(schema.accounts).where(eq(schema.accounts.userId, userId)),
      db.select().from(schema.assets).where(eq(schema.assets.userId, userId)),
      db.select().from(schema.deposits).where(eq(schema.deposits.userId, userId)),
      db.select().from(schema.loans).where(eq(schema.loans.userId, userId)),
      db.select().from(schema.people).where(eq(schema.people.userId, userId)),
      db
        .select()
        .from(schema.peopleTransactions)
        .where(eq(schema.peopleTransactions.userId, userId)),
    ]);

  const baseCurrencyCode =
    currencies.find((c) => c.isBase === 1)?.code ?? currencies[0]?.code ?? '';
  // Rows already in hand — `computeNetWorth`, not `getNetWorth`, so the same
  // five tables are not queried twice for one page.
  const netWorth = await computeNetWorth(db, baseCurrencyCode, {
    accounts: accountRows,
    assets: assetRows,
    deposits: depositRows,
    loans: loanRows,
    people: peopleRows,
  });

  const transactionsByPersonId = new Map<string, PersonTransactionItem[]>();
  for (const tx of peopleTxRows) {
    const list = transactionsByPersonId.get(tx.personId) ?? [];
    list.push({
      id: tx.id,
      amountMinor: tx.amountMinor,
      note: tx.note,
      occurredAt: tx.occurredAt,
    });
    transactionsByPersonId.set(tx.personId, list);
  }
  for (const list of transactionsByPersonId.values()) {
    list.sort((a, b) => b.occurredAt - a.occurredAt);
  }

  const toAccountItem = (a: (typeof accountRows)[number]): AccountItem => ({
    id: a.id,
    name: a.name,
    institution: a.institution,
    type: a.type as 'bank' | 'credit_card',
    balanceMinor: a.balanceMinor,
    currency: a.currency,
    creditLimitMinor: a.creditLimitMinor,
  });

  return {
    baseCurrencyCode,
    netWorthMinor: netWorth.netWorthMinor,
    unconvertedCurrencies: netWorth.unconvertedCurrencies,
    banking: accountRows.filter((a) => a.type === 'bank').map(toAccountItem),
    creditCards: accountRows.filter((a) => a.type === 'credit_card').map(toAccountItem),
    assets: assetRows.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type as 'physical' | 'security',
      valueMinor: a.valueMinor,
      currency: a.currency,
    })),
    deposits: depositRows.map((d) => ({
      id: d.id,
      name: d.name,
      amountMinor: d.amountMinor,
      currency: d.currency,
    })),
    loans: loanRows.map((l) => ({
      id: l.id,
      name: l.name,
      lender: l.lender,
      principalMinor: l.principalMinor,
      remainingBalanceMinor: clampRemaining(l.remainingBalanceMinor),
      installmentAmountMinor: l.installmentAmountMinor,
      currency: l.currency,
      startDate: l.startDate,
      endDate: l.endDate,
      linkedKindId: l.linkedKindId,
    })),
    people: peopleRows.map((p) => ({
      id: p.id,
      name: p.name,
      balanceMinor: p.balanceMinor,
      currency: p.currency,
      transactions: transactionsByPersonId.get(p.id) ?? [],
    })),
  };
}
