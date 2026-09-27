import { eq } from 'drizzle-orm';
import { sdk } from '@sovereignfs/sdk';
import type { ImportContext, PluginExportSection } from '@sovereignfs/sdk';
import type { LedgerDb } from '../_db/client';
import * as schema from '../_db/schema';
import { isSupportedCurrencyCode } from './currency-options';
import { isDateOnly } from './format';

/**
 * User data portability (RFC 0007 / RFC 0052) and account deletion
 * (RFC 0033) for Ledger.
 *
 * Ledger holds the most sensitive data on an instance — balances, loan
 * amounts, who owes whom — and shipped through 0.15.x with none of these
 * three hooks. That meant a bundle could never carry a user's budget (the
 * one plugin whose whole premise is that you own your data), and deleting an
 * account left every row of that user's financial history in place
 * indefinitely.
 *
 * **Every user-scoped table participates, and `ledger_fx_rates` does not.**
 * Exchange rates are untenanted, instance-wide public reference data
 * (SPEC.md's Data model) — not this user's to export and not theirs to
 * delete. `ledger_month_end_notifications` is also left out of the bundle
 * deliberately: it is a send-once marker, operational state rather than
 * anything the user authored, and carrying it to a new instance would
 * suppress a recap there for no reason. Deletion still clears it, because it
 * is keyed by `user_id`.
 *
 * **`anonymized` is always 0 (RFC 0097).** That rule covers rows another
 * user owns but the departing user is attributed on. Ledger is strictly
 * single-user with no membership, sharing or assignment model of any kind
 * (CONCEPT.md §2), so no such row can exist — every row here is owned by
 * exactly one user and deletion is the only correct action. This is stated
 * rather than left implicit so a future task that adds any shared surface
 * knows it has to revisit this file.
 */

/** This plugin's own export format version, independent of the manifest's. */
const SCHEMA_VERSION = 1;

/**
 * Deletion order, children before parents. `ledger_loans.linked_kind_id`
 * references `ledger_kinds` with `ON DELETE no action` (deliberately — the
 * schema's own comment: a loan cascade can't be expressed that way), so
 * loans MUST go before kinds or the delete is rejected wherever foreign keys
 * are enforced, which is both dialects the platform supports.
 */
async function deleteEveryRowFor(db: LedgerDb, userId: string): Promise<number> {
  let deleted = 0;

  // Counted with a select-then-delete pair rather than a driver-specific
  // affected-rows field: `sdk.db.getClient()` is libsql on SQLite instances
  // and node-postgres on Postgres ones, and the two do not report that
  // identically (same reasoning as the Warden plugin's own handler).
  const countAndDelete = async (
    count: () => Promise<{ length: number }>,
    remove: () => Promise<unknown>,
  ): Promise<void> => {
    const rows = await count();
    await remove();
    deleted += rows.length;
  };

  await countAndDelete(
    () =>
      db
        .select({ id: schema.jarTransactions.id })
        .from(schema.jarTransactions)
        .where(eq(schema.jarTransactions.userId, userId)),
    () => db.delete(schema.jarTransactions).where(eq(schema.jarTransactions.userId, userId)),
  );
  await countAndDelete(
    () =>
      db
        .select({ id: schema.savingJars.id })
        .from(schema.savingJars)
        .where(eq(schema.savingJars.userId, userId)),
    () => db.delete(schema.savingJars).where(eq(schema.savingJars.userId, userId)),
  );
  await countAndDelete(
    () =>
      db
        .select({ id: schema.transactions.id })
        .from(schema.transactions)
        .where(eq(schema.transactions.userId, userId)),
    () => db.delete(schema.transactions).where(eq(schema.transactions.userId, userId)),
  );
  await countAndDelete(
    () =>
      db.select({ id: schema.loans.id }).from(schema.loans).where(eq(schema.loans.userId, userId)),
    () => db.delete(schema.loans).where(eq(schema.loans.userId, userId)),
  );
  await countAndDelete(
    () =>
      db.select({ id: schema.kinds.id }).from(schema.kinds).where(eq(schema.kinds.userId, userId)),
    () => db.delete(schema.kinds).where(eq(schema.kinds.userId, userId)),
  );
  await countAndDelete(
    () =>
      db
        .select({ id: schema.categories.id })
        .from(schema.categories)
        .where(eq(schema.categories.userId, userId)),
    () => db.delete(schema.categories).where(eq(schema.categories.userId, userId)),
  );
  await countAndDelete(
    () =>
      db
        .select({ id: schema.peopleTransactions.id })
        .from(schema.peopleTransactions)
        .where(eq(schema.peopleTransactions.userId, userId)),
    () => db.delete(schema.peopleTransactions).where(eq(schema.peopleTransactions.userId, userId)),
  );
  await countAndDelete(
    () =>
      db
        .select({ id: schema.people.id })
        .from(schema.people)
        .where(eq(schema.people.userId, userId)),
    () => db.delete(schema.people).where(eq(schema.people.userId, userId)),
  );
  await countAndDelete(
    () =>
      db
        .select({ id: schema.incomes.id })
        .from(schema.incomes)
        .where(eq(schema.incomes.userId, userId)),
    () => db.delete(schema.incomes).where(eq(schema.incomes.userId, userId)),
  );
  await countAndDelete(
    () =>
      db
        .select({ id: schema.currencies.id })
        .from(schema.currencies)
        .where(eq(schema.currencies.userId, userId)),
    () => db.delete(schema.currencies).where(eq(schema.currencies.userId, userId)),
  );
  await countAndDelete(
    () =>
      db
        .select({ id: schema.accounts.id })
        .from(schema.accounts)
        .where(eq(schema.accounts.userId, userId)),
    () => db.delete(schema.accounts).where(eq(schema.accounts.userId, userId)),
  );
  await countAndDelete(
    () =>
      db
        .select({ id: schema.assets.id })
        .from(schema.assets)
        .where(eq(schema.assets.userId, userId)),
    () => db.delete(schema.assets).where(eq(schema.assets.userId, userId)),
  );
  await countAndDelete(
    () =>
      db
        .select({ id: schema.deposits.id })
        .from(schema.deposits)
        .where(eq(schema.deposits.userId, userId)),
    () => db.delete(schema.deposits).where(eq(schema.deposits.userId, userId)),
  );
  await countAndDelete(
    () =>
      db
        .select({ year: schema.periodReviews.year })
        .from(schema.periodReviews)
        .where(eq(schema.periodReviews.userId, userId)),
    () => db.delete(schema.periodReviews).where(eq(schema.periodReviews.userId, userId)),
  );
  await countAndDelete(
    () =>
      db
        .select({ year: schema.monthEndNotifications.year })
        .from(schema.monthEndNotifications)
        .where(eq(schema.monthEndNotifications.userId, userId)),
    () =>
      db
        .delete(schema.monthEndNotifications)
        .where(eq(schema.monthEndNotifications.userId, userId)),
  );

  return deleted;
}

export async function registerPortability(): Promise<void> {
  await sdk.portability.provideExport(async (ctx) => {
    const db = (await sdk.db.getClient()) as LedgerDb;

    const [
      currencies,
      incomes,
      categories,
      kinds,
      transactions,
      savingJars,
      jarTransactions,
      accounts,
      assets,
      deposits,
      loans,
      people,
      peopleTransactions,
      periodReviews,
    ] = await Promise.all([
      db.select().from(schema.currencies).where(eq(schema.currencies.userId, ctx.userId)),
      db.select().from(schema.incomes).where(eq(schema.incomes.userId, ctx.userId)),
      db.select().from(schema.categories).where(eq(schema.categories.userId, ctx.userId)),
      db.select().from(schema.kinds).where(eq(schema.kinds.userId, ctx.userId)),
      db.select().from(schema.transactions).where(eq(schema.transactions.userId, ctx.userId)),
      db.select().from(schema.savingJars).where(eq(schema.savingJars.userId, ctx.userId)),
      db.select().from(schema.jarTransactions).where(eq(schema.jarTransactions.userId, ctx.userId)),
      db.select().from(schema.accounts).where(eq(schema.accounts.userId, ctx.userId)),
      db.select().from(schema.assets).where(eq(schema.assets.userId, ctx.userId)),
      db.select().from(schema.deposits).where(eq(schema.deposits.userId, ctx.userId)),
      db.select().from(schema.loans).where(eq(schema.loans.userId, ctx.userId)),
      db.select().from(schema.people).where(eq(schema.people.userId, ctx.userId)),
      db
        .select()
        .from(schema.peopleTransactions)
        .where(eq(schema.peopleTransactions.userId, ctx.userId)),
      db.select().from(schema.periodReviews).where(eq(schema.periodReviews.userId, ctx.userId)),
    ]);

    // `tenant_id`/`user_id` are stripped from every row: they are this
    // instance's own identifiers, meaningless on the instance a bundle is
    // restored to, and `provideImport` sets them from `ctx` there anyway.
    const strip = <T extends { tenantId: string; userId: string }>({
      tenantId: _tenantId,
      userId: _userId,
      ...rest
    }: T) => rest;

    const section: PluginExportSection = {
      pluginId: 'fs.sovereign.ledger',
      schemaVersion: SCHEMA_VERSION,
      data: {
        currencies: currencies.map(strip),
        incomes: incomes.map(strip),
        categories: categories.map(strip),
        kinds: kinds.map(strip),
        transactions: transactions.map(strip),
        savingJars: savingJars.map(strip),
        jarTransactions: jarTransactions.map(strip),
        accounts: accounts.map(strip),
        assets: assets.map(strip),
        deposits: deposits.map(strip),
        loans: loans.map(strip),
        people: people.map(strip),
        peopleTransactions: peopleTransactions.map(strip),
        periodReviews: periodReviews.map(strip),
      },
    };
    return section;
  });

  await sdk.portability.provideImport(async (section, ctx) => {
    await restoreLedgerSection(section, ctx);
  });

  await sdk.portability.provideDelete(async (ctx) => {
    const db = ctx.db as LedgerDb;
    const deleted = await deleteEveryRowFor(db, ctx.userId);
    // See this file's header: Ledger has no rows another user owns, so no
    // attribution can be severed and `anonymized` is structurally zero.
    return { deleted, anonymized: 0 };
  });
}

// ---------------------------------------------------------------------------
// Import

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function rows(data: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = data[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function str(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function optionalStr(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function int(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function currency(row: Record<string, unknown>, key = 'currency'): string | null {
  const value = row[key];
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  // Same hard rule the server actions enforce: an unsupported code reaches
  // `Intl.NumberFormat` on render and throws for every page showing the row,
  // so a bundle carrying one has that row skipped rather than stored.
  return isSupportedCurrencyCode(code) ? code : null;
}

function oneOf<T extends string>(
  row: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T | null {
  const value = row[key];
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/**
 * Restores a bundle section. Every row is re-validated rather than trusted:
 * a bundle is a file the user can hand-edit or carry between instances, so
 * this is the same untrusted input a server action's own `clean*` helpers
 * guard against. A row that fails validation is skipped and counted — one
 * malformed row must not abort an entire restore, since the alternative is
 * a user losing their whole financial history to one bad field.
 *
 * Ids are remapped through `ctx.remapId`, which is stable within an import,
 * so every foreign key below (`categoryId`, `kindId`, `jarId`, `personId`,
 * `linkedKindId`) keeps pointing at the right row on the target instance.
 */
export async function restoreLedgerSection(
  section: PluginExportSection,
  ctx: ImportContext,
): Promise<void> {
  if (!isRecord(section.data)) return;
  const data = section.data;
  const db = (await sdk.db.getClient()) as LedgerDb;
  const scope = { tenantId: ctx.tenantId, userId: ctx.userId };
  const now = Date.now();
  let skipped = 0;
  const skip = () => {
    skipped += 1;
    return null;
  };

  const timestamps = (row: Record<string, unknown>) => ({
    createdAt: int(row, 'createdAt') ?? now,
    updatedAt: int(row, 'updatedAt') ?? now,
  });

  const currencyValues = rows(data, 'currencies')
    .map((row) => {
      const id = str(row, 'id');
      const code = currency(row, 'code');
      if (!id || !code) return skip();
      return {
        id: ctx.remapId(id),
        ...scope,
        code,
        isBase: int(row, 'isBase') === 1 ? 1 : 0,
        ...timestamps(row),
      };
    })
    .filter((row) => row !== null);

  const incomeValues = rows(data, 'incomes')
    .map((row) => {
      const id = str(row, 'id');
      const label = str(row, 'label');
      const amountMinor = int(row, 'amountMinor');
      const code = currency(row);
      const kind = oneOf(row, 'kind', ['primary', 'secondary'] as const);
      if (!id || !label || amountMinor === null || !code || !kind) return skip();
      return {
        id: ctx.remapId(id),
        ...scope,
        label,
        amountMinor,
        currency: code,
        kind,
        ...timestamps(row),
      };
    })
    .filter((row) => row !== null);

  const categoryValues = rows(data, 'categories')
    .map((row) => {
      const id = str(row, 'id');
      const name = str(row, 'name');
      const type = oneOf(row, 'type', ['dynamic', 'fixed', 'saving'] as const);
      if (!id || !name || !type) return skip();
      return { id: ctx.remapId(id), ...scope, name, type, ...timestamps(row) };
    })
    .filter((row) => row !== null);

  const categoryIds = new Set(categoryValues.map((c) => c.id));
  const kindValues = rows(data, 'kinds')
    .map((row) => {
      const id = str(row, 'id');
      const categoryId = str(row, 'categoryId');
      const name = str(row, 'name');
      const predictedAmountMinor = int(row, 'predictedAmountMinor');
      const code = currency(row);
      if (!id || !categoryId || !name || predictedAmountMinor === null || !code) return skip();
      const mappedCategoryId = ctx.remapId(categoryId);
      // An orphan kind would break every category aggregate that buckets by
      // category id, so it is dropped rather than imported danglingly.
      if (!categoryIds.has(mappedCategoryId)) return skip();
      const anchorDate = optionalStr(row, 'recurrenceAnchorDate');
      return {
        id: ctx.remapId(id),
        ...scope,
        categoryId: mappedCategoryId,
        name,
        predictedAmountMinor,
        currency: code,
        recurrenceIntervalUnit: oneOf(row, 'recurrenceIntervalUnit', [
          'day',
          'week',
          'month',
          'year',
        ] as const),
        recurrenceIntervalCount: int(row, 'recurrenceIntervalCount'),
        recurrenceAnchorDate: anchorDate && isDateOnly(anchorDate) ? anchorDate : null,
        ...timestamps(row),
      };
    })
    .filter((row) => row !== null);

  const kindIds = new Set(kindValues.map((k) => k.id));
  const transactionValues = rows(data, 'transactions')
    .map((row) => {
      const id = str(row, 'id');
      const kindId = str(row, 'kindId');
      const amountMinor = int(row, 'amountMinor');
      const occurredAt = int(row, 'occurredAt');
      const code = currency(row);
      if (!id || !kindId || amountMinor === null || occurredAt === null || !code) return skip();
      const mappedKindId = ctx.remapId(kindId);
      if (!kindIds.has(mappedKindId)) return skip();
      return {
        id: ctx.remapId(id),
        ...scope,
        kindId: mappedKindId,
        amountMinor,
        currency: code,
        occurredAt,
        note: optionalStr(row, 'note'),
        ...timestamps(row),
      };
    })
    .filter((row) => row !== null);

  const jarValues = rows(data, 'savingJars')
    .map((row) => {
      const id = str(row, 'id');
      const kindId = str(row, 'kindId');
      const balanceMinor = int(row, 'balanceMinor');
      const code = currency(row);
      if (!id || !kindId || balanceMinor === null || !code) return skip();
      const mappedKindId = ctx.remapId(kindId);
      if (!kindIds.has(mappedKindId)) return skip();
      return {
        id: ctx.remapId(id),
        ...scope,
        kindId: mappedKindId,
        balanceMinor,
        currency: code,
        ...timestamps(row),
      };
    })
    .filter((row) => row !== null);

  const jarIds = new Set(jarValues.map((j) => j.id));
  const jarTransactionValues = rows(data, 'jarTransactions')
    .map((row) => {
      const id = str(row, 'id');
      const jarId = str(row, 'jarId');
      const amountMinor = int(row, 'amountMinor');
      const occurredAt = int(row, 'occurredAt');
      if (!id || !jarId || amountMinor === null || occurredAt === null) return skip();
      const mappedJarId = ctx.remapId(jarId);
      if (!jarIds.has(mappedJarId)) return skip();
      const categoryId = optionalStr(row, 'categoryId');
      const mappedCategoryId = categoryId ? ctx.remapId(categoryId) : null;
      return {
        id: ctx.remapId(id),
        ...scope,
        jarId: mappedJarId,
        amountMinor,
        categoryId: mappedCategoryId && categoryIds.has(mappedCategoryId) ? mappedCategoryId : null,
        note: optionalStr(row, 'note'),
        occurredAt,
      };
    })
    .filter((row) => row !== null);

  const accountValues = rows(data, 'accounts')
    .map((row) => {
      const id = str(row, 'id');
      const name = str(row, 'name');
      const type = oneOf(row, 'type', ['bank', 'credit_card'] as const);
      const balanceMinor = int(row, 'balanceMinor');
      const code = currency(row);
      if (!id || !name || !type || balanceMinor === null || !code) return skip();
      return {
        id: ctx.remapId(id),
        ...scope,
        name,
        institution: optionalStr(row, 'institution'),
        type,
        balanceMinor,
        currency: code,
        creditLimitMinor: int(row, 'creditLimitMinor'),
        ...timestamps(row),
      };
    })
    .filter((row) => row !== null);

  const assetValues = rows(data, 'assets')
    .map((row) => {
      const id = str(row, 'id');
      const name = str(row, 'name');
      const type = oneOf(row, 'type', ['physical', 'security'] as const);
      const valueMinor = int(row, 'valueMinor');
      const code = currency(row);
      if (!id || !name || !type || valueMinor === null || !code) return skip();
      return {
        id: ctx.remapId(id),
        ...scope,
        name,
        type,
        valueMinor,
        currency: code,
        ...timestamps(row),
      };
    })
    .filter((row) => row !== null);

  const depositValues = rows(data, 'deposits')
    .map((row) => {
      const id = str(row, 'id');
      const name = str(row, 'name');
      const amountMinor = int(row, 'amountMinor');
      const code = currency(row);
      if (!id || !name || amountMinor === null || !code) return skip();
      return {
        id: ctx.remapId(id),
        ...scope,
        name,
        amountMinor,
        currency: code,
        ...timestamps(row),
      };
    })
    .filter((row) => row !== null);

  const loanValues = rows(data, 'loans')
    .map((row) => {
      const id = str(row, 'id');
      const name = str(row, 'name');
      const lender = str(row, 'lender');
      const principalMinor = int(row, 'principalMinor');
      const remainingBalanceMinor = int(row, 'remainingBalanceMinor');
      const installmentAmountMinor = int(row, 'installmentAmountMinor');
      const code = currency(row);
      const startDate = str(row, 'startDate');
      const endDate = str(row, 'endDate');
      const linkedKindId = str(row, 'linkedKindId');
      if (
        !id ||
        !name ||
        !lender ||
        principalMinor === null ||
        remainingBalanceMinor === null ||
        installmentAmountMinor === null ||
        !code ||
        !startDate ||
        !isDateOnly(startDate) ||
        !endDate ||
        !isDateOnly(endDate) ||
        !linkedKindId
      ) {
        return skip();
      }
      const mappedKindId = ctx.remapId(linkedKindId);
      if (!kindIds.has(mappedKindId)) return skip();
      return {
        id: ctx.remapId(id),
        ...scope,
        name,
        lender,
        principalMinor,
        remainingBalanceMinor,
        installmentAmountMinor,
        currency: code,
        startDate,
        endDate,
        linkedKindId: mappedKindId,
        ...timestamps(row),
      };
    })
    .filter((row) => row !== null);

  const peopleValues = rows(data, 'people')
    .map((row) => {
      const id = str(row, 'id');
      const name = str(row, 'name');
      const balanceMinor = int(row, 'balanceMinor');
      const code = currency(row);
      if (!id || !name || balanceMinor === null || !code) return skip();
      return {
        id: ctx.remapId(id),
        ...scope,
        name,
        balanceMinor,
        currency: code,
        ...timestamps(row),
      };
    })
    .filter((row) => row !== null);

  const personIds = new Set(peopleValues.map((p) => p.id));
  const peopleTransactionValues = rows(data, 'peopleTransactions')
    .map((row) => {
      const id = str(row, 'id');
      const personId = str(row, 'personId');
      const amountMinor = int(row, 'amountMinor');
      const occurredAt = int(row, 'occurredAt');
      if (!id || !personId || amountMinor === null || occurredAt === null) return skip();
      const mappedPersonId = ctx.remapId(personId);
      if (!personIds.has(mappedPersonId)) return skip();
      return {
        id: ctx.remapId(id),
        ...scope,
        personId: mappedPersonId,
        amountMinor,
        note: optionalStr(row, 'note'),
        occurredAt,
      };
    })
    .filter((row) => row !== null);

  const reviewValues = rows(data, 'periodReviews')
    .map((row) => {
      const year = int(row, 'year');
      const month = int(row, 'month');
      const reviewedAt = int(row, 'reviewedAt');
      if (year === null || month === null || month < 1 || month > 12 || reviewedAt === null) {
        return skip();
      }
      return { ...scope, year, month, reviewedAt };
    })
    .filter((row) => row !== null);

  // Parents before children, the mirror of `deleteEveryRowFor`'s order —
  // every foreign key above must already resolve by the time its row lands.
  const insert = async (table: Parameters<LedgerDb['insert']>[0], values: unknown[]) => {
    if (values.length === 0) return;
    await db
      .insert(table)
      .values(values as never)
      .onConflictDoNothing();
  };

  await insert(schema.currencies, currencyValues);
  await insert(schema.incomes, incomeValues);
  await insert(schema.categories, categoryValues);
  await insert(schema.kinds, kindValues);
  await insert(schema.transactions, transactionValues);
  await insert(schema.savingJars, jarValues);
  await insert(schema.jarTransactions, jarTransactionValues);
  await insert(schema.accounts, accountValues);
  await insert(schema.assets, assetValues);
  await insert(schema.deposits, depositValues);
  await insert(schema.loans, loanValues);
  await insert(schema.people, peopleValues);
  await insert(schema.peopleTransactions, peopleTransactionValues);
  await insert(schema.periodReviews, reviewValues);

  if (skipped > 0) {
    console.warn(`ledger: skipped ${skipped} invalid row(s) while restoring an export bundle`);
  }
}
