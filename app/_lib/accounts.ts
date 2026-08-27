import { eq } from 'drizzle-orm';
import type { LedgerDb } from '../_db/client';
import * as schema from '../_db/schema';
import { sumConvertedToBase } from './money';

/**
 * Net worth = assets (bank balances + assets + deposits) minus liabilities
 * (credit card balances + loans' remaining balance), all converted to the
 * base currency. Exported separately from `getAccountsData` so Overview's
 * summary card computes the exact same number rather than a second,
 * independently-maintained copy of this math.
 */
export async function getNetWorthMinor(
  db: LedgerDb,
  userId: string,
  baseCurrencyCode: string,
): Promise<number> {
  const [accounts, assets, deposits, loans] = await Promise.all([
    db.select().from(schema.accounts).where(eq(schema.accounts.userId, userId)),
    db.select().from(schema.assets).where(eq(schema.assets.userId, userId)),
    db.select().from(schema.deposits).where(eq(schema.deposits.userId, userId)),
    db.select().from(schema.loans).where(eq(schema.loans.userId, userId)),
  ]);

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
  return assetsMinor - liabilitiesMinor;
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
      db.select().from(schema.peopleTransactions).where(eq(schema.peopleTransactions.userId, userId)),
    ]);

  const baseCurrencyCode =
    currencies.find((c) => c.isBase === 1)?.code ?? currencies[0]?.code ?? '';
  const netWorthMinor = await getNetWorthMinor(db, userId, baseCurrencyCode);

  const transactionsByPersonId = new Map<string, PersonTransactionItem[]>();
  for (const tx of peopleTxRows) {
    const list = transactionsByPersonId.get(tx.personId) ?? [];
    list.push({ id: tx.id, amountMinor: tx.amountMinor, note: tx.note, occurredAt: tx.occurredAt });
    transactionsByPersonId.set(tx.personId, list);
  }
  for (const list of transactionsByPersonId.values()) {
    list.sort((a, b) => b.occurredAt - a.occurredAt);
  }

  return {
    baseCurrencyCode,
    netWorthMinor,
    banking: accountRows
      .filter((a) => a.type === 'bank')
      .map((a) => ({
        id: a.id,
        name: a.name,
        institution: a.institution,
        type: 'bank' as const,
        balanceMinor: a.balanceMinor,
        currency: a.currency,
        creditLimitMinor: a.creditLimitMinor,
      })),
    creditCards: accountRows
      .filter((a) => a.type === 'credit_card')
      .map((a) => ({
        id: a.id,
        name: a.name,
        institution: a.institution,
        type: 'credit_card' as const,
        balanceMinor: a.balanceMinor,
        currency: a.currency,
        creditLimitMinor: a.creditLimitMinor,
      })),
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
      remainingBalanceMinor: l.remainingBalanceMinor,
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
