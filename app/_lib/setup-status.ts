import { and, eq, ne } from 'drizzle-orm';
import type { LedgerDb } from '../_db/client';
import * as schema from '../_db/schema';

/**
 * The setup wizard's three steps (`docs/adhoc/setup-wizard.md`) map onto
 * three existence checks — base currency, primary income, at least one
 * (non-saving) category — rather than a stored "onboarding complete" flag.
 * `/ledger` (`app/page.tsx`) uses this to decide whether to show the wizard
 * (and which step to resume at) or the setup-complete placeholder.
 *
 * The three checks run in parallel: every page under the shell calls this
 * before its own payload, so three sequential round trips here were a tax
 * on every navigation.
 */
export type IncompleteSetupStatus = {
  complete: false;
  step: 1 | 2 | 3;
  baseCurrencyCode: string | null;
};
export type SetupStatus = IncompleteSetupStatus | { complete: true };

export async function getSetupStatus(db: LedgerDb, userId: string): Promise<SetupStatus> {
  const [[baseCurrency], [primaryIncome], [anyCategory]] = await Promise.all([
    db
      .select({ code: schema.currencies.code })
      .from(schema.currencies)
      .where(and(eq(schema.currencies.userId, userId), eq(schema.currencies.isBase, 1)))
      .limit(1),
    db
      .select({ id: schema.incomes.id })
      .from(schema.incomes)
      .where(and(eq(schema.incomes.userId, userId), eq(schema.incomes.kind, 'primary')))
      .limit(1),
    // Saving-type categories don't count: the wizard's step 3 is about
    // expense categories, and a saving jar alone isn't a usable budget.
    db
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(and(eq(schema.categories.userId, userId), ne(schema.categories.type, 'saving')))
      .limit(1),
  ]);

  if (!baseCurrency) return { complete: false, step: 1, baseCurrencyCode: null };
  if (!primaryIncome) return { complete: false, step: 2, baseCurrencyCode: baseCurrency.code };
  if (!anyCategory) return { complete: false, step: 3, baseCurrencyCode: baseCurrency.code };
  return { complete: true };
}
