import { and, eq, ne } from 'drizzle-orm';
import type { LedgerDb } from '../_db/client';
import * as schema from '../_db/schema';

/**
 * The setup wizard's three steps (`docs/adhoc/setup-wizard.md`) map onto
 * three existence checks — base currency, primary income, at least one
 * (non-saving) category — rather than a stored "onboarding complete" flag.
 * `/ledger` (`app/page.tsx`) uses this to decide whether to show the wizard
 * (and which step to resume at) or the setup-complete placeholder.
 */
export type SetupStatus =
  | { complete: false; step: 1 | 2 | 3; baseCurrencyCode: string | null }
  | { complete: true };

export async function getSetupStatus(db: LedgerDb, userId: string): Promise<SetupStatus> {
  const [baseCurrency] = await db
    .select({ code: schema.currencies.code })
    .from(schema.currencies)
    .where(and(eq(schema.currencies.userId, userId), eq(schema.currencies.isBase, 1)));
  if (!baseCurrency) return { complete: false, step: 1, baseCurrencyCode: null };

  const [primaryIncome] = await db
    .select({ id: schema.incomes.id })
    .from(schema.incomes)
    .where(and(eq(schema.incomes.userId, userId), eq(schema.incomes.kind, 'primary')));
  if (!primaryIncome) return { complete: false, step: 2, baseCurrencyCode: baseCurrency.code };

  // Reserved for L.12: saving-type categories can't exist yet, but this
  // filters defensively anyway rather than assuming that invariant holds.
  const [anyCategory] = await db
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(and(eq(schema.categories.userId, userId), ne(schema.categories.type, 'saving')));
  if (!anyCategory) return { complete: false, step: 3, baseCurrencyCode: baseCurrency.code };

  return { complete: true };
}
