import { eq } from 'drizzle-orm';
import type { LedgerDb } from '../_db/client';
import * as schema from '../_db/schema';
import { listCategoriesWithKinds, listCurrencies, listIncomes, type CategoryWithKinds } from './queries';

export interface CurrencyItem {
  id: string;
  code: string;
  isBase: boolean;
}

export interface IncomeItem {
  id: string;
  label: string;
  amountMinor: number;
  currency: string;
  kind: 'primary' | 'secondary';
}

export interface SettingsData {
  baseCurrencyCode: string;
  currencies: CurrencyItem[];
  incomes: IncomeItem[];
  categories: CategoryWithKinds[];
  /** Kind ids a loan's `linkedKindId` still points at — Settings disables
   *  delete for these client-side (prevention over error), backed by the
   *  server-side guard in `deleteCategory`/`deleteKind` as a backstop. */
  loanLinkedKindIds: Set<string>;
}

/**
 * Settings' one-round-trip payload. `listCurrencies`/`listIncomes`/
 * `listCategoriesWithKinds` already exist (built for the setup wizard and
 * expense entry, L.3/L.4) — this is their first consumer outside that path.
 */
export async function getSettingsData(db: LedgerDb, userId: string): Promise<SettingsData> {
  const [currencyRows, incomeRows, categories, loanRows] = await Promise.all([
    listCurrencies(db, userId),
    listIncomes(db, userId),
    listCategoriesWithKinds(db, userId),
    db
      .select({ linkedKindId: schema.loans.linkedKindId })
      .from(schema.loans)
      .where(eq(schema.loans.userId, userId)),
  ]);

  const baseCurrencyCode =
    currencyRows.find((c) => c.isBase === 1)?.code ?? currencyRows[0]?.code ?? '';

  return {
    baseCurrencyCode,
    currencies: currencyRows.map((c) => ({ id: c.id, code: c.code, isBase: c.isBase === 1 })),
    incomes: incomeRows.map((i) => ({
      id: i.id,
      label: i.label,
      amountMinor: i.amountMinor,
      currency: i.currency,
      kind: i.kind as 'primary' | 'secondary',
    })),
    categories,
    loanLinkedKindIds: new Set(loanRows.map((l) => l.linkedKindId)),
  };
}
