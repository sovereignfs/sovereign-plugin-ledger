/**
 * Portability hooks (RFC 0007 export/import, RFC 0033 account deletion).
 *
 * The deletion test is deliberately *structural*: it enumerates every
 * user-scoped table in the schema and asserts nothing survives, rather than
 * listing tables by hand. A hand-written list is exactly how the Warden
 * plugin's own handler came to miss two tables that were added later, leaving
 * a deleted account's data behind — here that mistake fails the suite instead.
 */
import { getTableColumns, getTableName, is } from 'drizzle-orm';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportContext, PluginExportSection } from '@sovereignfs/sdk';
import { createTestDb, type TestDb } from '../../_db/__tests__/test-db';
import * as schema from '../../_db/schema';

const harness = vi.hoisted(() => ({
  currentUser: null as { id: string; tenantId: string } | null,
  dbClient: null as unknown,
  hooks: {} as {
    exportResolver?: (ctx: {
      userId: string;
      tenantId: string;
      options: { includeFiles: boolean };
    }) => Promise<PluginExportSection>;
    importHandler?: (section: PluginExportSection, ctx: ImportContext) => Promise<void>;
    deleteHandler?: (ctx: {
      userId: string;
      tenantId: string;
      db: unknown;
    }) => Promise<{ deleted: number; anonymized?: number }>;
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@sovereignfs/sdk', () => ({
  sdk: {
    auth: {
      requireSession: vi.fn(async () => {
        if (!harness.currentUser) throw new Error('Not authenticated');
        return { user: harness.currentUser };
      }),
    },
    db: { getClient: vi.fn(async () => harness.dbClient) },
    portability: {
      provideExport: vi.fn(async (r: never) => {
        harness.hooks.exportResolver = r;
      }),
      provideImport: vi.fn(async (h: never) => {
        harness.hooks.importHandler = h;
      }),
      provideDelete: vi.fn(async (h: never) => {
        harness.hooks.deleteHandler = h;
      }),
    },
  },
}));

import * as actions from '../../actions';
import { registerPortability } from '../portability';

const owner = { id: 'user-owner', tenantId: 'default' };
const outsider = { id: 'user-outsider', tenantId: 'default' };
const restorer = { id: 'user-restorer', tenantId: 'default' };

let t: TestDb;

function must<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`expected ${label} to exist`);
  return value;
}

/** Every table in the schema that carries a `user_id` — `ledger_fx_rates`,
 *  the one deliberately untenanted table, drops out on its own. */
const userScopedTables = (Object.values(schema) as unknown[]).filter(
  (value): value is SQLiteTable => is(value, SQLiteTable) && 'userId' in getTableColumns(value),
);

function actAs(user: { id: string; tenantId: string } | null): void {
  harness.currentUser = user;
}

/** A full spread of rows across every table a user can populate. */
async function seedEverything(): Promise<void> {
  await actions.createCurrency({ code: 'EUR', isBase: true });
  await actions.createCurrency({ code: 'USD' });
  await actions.createIncome({
    label: 'Salary',
    amountMinor: 300_000,
    currency: 'EUR',
    kind: 'primary',
  });
  await actions.createCategoryWithKind({
    name: 'Groceries',
    type: 'dynamic',
    predictedAmountMinor: 40_000,
    currency: 'EUR',
  });
  await actions.createCategoryWithKind({
    name: 'Travel jar',
    type: 'saving',
    predictedAmountMinor: 10_000,
    currency: 'EUR',
  });
  const kind = must(
    (await t.db.select().from(schema.kinds)).find((k) => k.name === 'Groceries'),
    'groceries kind',
  );
  await actions.createTransaction({
    kindId: kind.id,
    amountMinor: 2_500,
    note: 'Market',
  });
  const jar = must((await t.db.select().from(schema.savingJars))[0], 'jar');
  await actions.createJarTransaction({ jarId: jar.id, amountMinor: 5_000 });
  await actions.createAccount({
    name: 'Checking',
    institution: 'Primary Bank',
    type: 'bank',
    balanceMinor: 120_000,
    currency: 'EUR',
  });
  await actions.createAccount({
    name: 'Card',
    type: 'credit_card',
    balanceMinor: 30_000,
    currency: 'EUR',
    creditLimitMinor: 200_000,
  });
  await actions.createAsset({
    name: 'Bike',
    type: 'physical',
    valueMinor: 90_000,
    currency: 'EUR',
  });
  await actions.createDeposit({
    name: 'Apartment',
    amountMinor: 250_000,
    currency: 'EUR',
  });
  await actions.createLoan({
    name: 'Car loan',
    lender: 'Bank',
    principalMinor: 800_000,
    remainingBalanceMinor: 500_000,
    installmentAmountMinor: 25_000,
    currency: 'EUR',
    startDate: '2025-01-01',
    endDate: '2029-01-01',
  });
  await actions.createPerson({ name: 'Alex', currency: 'EUR' });
  const person = must((await t.db.select().from(schema.people))[0], 'person');
  await actions.createPeopleTransaction({
    personId: person.id,
    amountMinor: 4_000,
    note: 'Dinner',
  });
  await actions.markPeriodReviewed({ year: 2025, month: 1 });
}

async function countFor(table: SQLiteTable, userId: string): Promise<number> {
  const rows = (await t.db.select().from(table)) as Array<{ userId?: string }>;
  return rows.filter((row) => row.userId === userId).length;
}

beforeEach(async () => {
  t = await createTestDb();
  harness.dbClient = t.ledger;
  harness.hooks = {};
  await registerPortability();
});

afterEach(() => {
  t.close();
  harness.currentUser = null;
});

describe('registerPortability', () => {
  it('registers an export resolver, an import handler and a deletion handler', () => {
    expect(harness.hooks.exportResolver).toBeTypeOf('function');
    expect(harness.hooks.importHandler).toBeTypeOf('function');
    expect(harness.hooks.deleteHandler).toBeTypeOf('function');
  });
});

describe('provideDelete', () => {
  it('leaves no row behind in ANY user-scoped table', async () => {
    actAs(owner);
    await seedEverything();

    // Sanity: the sweep below is only meaningful if the seed actually filled
    // these tables.
    const seeded: string[] = [];
    for (const table of userScopedTables) {
      if ((await countFor(table, owner.id)) > 0) seeded.push(getTableName(table));
    }
    expect(seeded.length).toBeGreaterThanOrEqual(userScopedTables.length - 1);

    const result = await must(
      harness.hooks.deleteHandler,
      'delete handler',
    )({
      userId: owner.id,
      tenantId: owner.tenantId,
      db: t.ledger,
    });
    expect(result.deleted).toBeGreaterThan(0);
    // Ledger has no rows another user owns, so nothing can be severed.
    expect(result.anonymized).toBe(0);

    for (const table of userScopedTables) {
      expect(
        await countFor(table, owner.id),
        `${getTableName(table)} still holds rows for the deleted user`,
      ).toBe(0);
    }
  });

  it("never touches another user's rows", async () => {
    actAs(outsider);
    await seedEverything();
    actAs(owner);
    await seedEverything();

    const before = new Map<string, number>();
    for (const table of userScopedTables) {
      before.set(getTableName(table), await countFor(table, outsider.id));
    }

    await must(
      harness.hooks.deleteHandler,
      'delete handler',
    )({
      userId: owner.id,
      tenantId: owner.tenantId,
      db: t.ledger,
    });

    for (const table of userScopedTables) {
      expect(await countFor(table, outsider.id)).toBe(before.get(getTableName(table)));
    }
  });

  it('leaves the untenanted exchange-rate table alone', async () => {
    await t.db.insert(schema.fxRates).values({
      id: 'rate-1',
      currencyCode: 'EUR',
      pivotCode: 'USD',
      rate: 1.1,
      asOfDate: '2026-01-02',
      source: 'test',
    });
    actAs(owner);
    await seedEverything();

    await must(
      harness.hooks.deleteHandler,
      'delete handler',
    )({
      userId: owner.id,
      tenantId: owner.tenantId,
      db: t.ledger,
    });

    expect(await t.db.select().from(schema.fxRates)).toHaveLength(1);
  });
});

describe('provideExport / provideImport', () => {
  function importContextFor(user: { id: string; tenantId: string }): ImportContext {
    const remapped = new Map<string, string>();
    return {
      userId: user.id,
      tenantId: user.tenantId,
      remapId: (originalId: string) => {
        const existing = remapped.get(originalId);
        if (existing) return existing;
        const next = `${user.id}-${remapped.size}`;
        remapped.set(originalId, next);
        return next;
      },
    };
  }

  it('round-trips a full budget into a different user without leaking ids or scope', async () => {
    actAs(owner);
    await seedEverything();

    const section = await must(
      harness.hooks.exportResolver,
      'export resolver',
    )({
      userId: owner.id,
      tenantId: owner.tenantId,
      options: { includeFiles: true },
    });
    expect(section.pluginId).toBe('fs.sovereign.ledger');
    expect(section.schemaVersion).toBe(1);

    // No instance-specific ownership columns travel in the bundle.
    const serialized = JSON.stringify(section.data);
    expect(serialized).not.toContain(owner.id);
    expect(serialized).not.toContain('tenantId');

    await must(harness.hooks.importHandler, 'import handler')(section, importContextFor(restorer));

    for (const table of userScopedTables) {
      const name = getTableName(table);
      // month-end markers are operational state and deliberately not exported.
      if (name === 'ledger_month_end_notifications') continue;
      expect(await countFor(table, restorer.id), `${name} did not restore`).toBe(
        await countFor(table, owner.id),
      );
    }
  });

  it('keeps foreign keys pointing at the restored rows, not the source ids', async () => {
    actAs(owner);
    await seedEverything();
    const section = await must(
      harness.hooks.exportResolver,
      'export resolver',
    )({
      userId: owner.id,
      tenantId: owner.tenantId,
      options: { includeFiles: true },
    });
    await must(harness.hooks.importHandler, 'import handler')(section, importContextFor(restorer));

    const restoredKinds = (await t.db.select().from(schema.kinds)).filter(
      (k) => k.userId === restorer.id,
    );
    const restoredCategoryIds = new Set(
      (await t.db.select().from(schema.categories))
        .filter((c) => c.userId === restorer.id)
        .map((c) => c.id),
    );
    expect(restoredKinds.length).toBeGreaterThan(0);
    for (const kind of restoredKinds) {
      expect(restoredCategoryIds.has(kind.categoryId)).toBe(true);
    }

    const restoredLoan = must(
      (await t.db.select().from(schema.loans)).find((l) => l.userId === restorer.id),
      'restored loan',
    );
    expect(restoredKinds.some((k) => k.id === restoredLoan.linkedKindId)).toBe(true);
  });

  it('skips a row carrying an unsupported currency instead of storing it', async () => {
    actAs(owner);
    await seedEverything();
    const section = await must(
      harness.hooks.exportResolver,
      'export resolver',
    )({
      userId: owner.id,
      tenantId: owner.tenantId,
      options: { includeFiles: true },
    });

    // A hand-edited bundle: an arbitrary code here would reach
    // `Intl.NumberFormat` on render and throw for every page showing the row.
    const data = section.data as { accounts: Array<Record<string, unknown>> };
    const accountCount = data.accounts.length;
    must(data.accounts[0], 'account').currency = 'XYZ';

    await must(harness.hooks.importHandler, 'import handler')(section, importContextFor(restorer));

    const restoredAccounts = (await t.db.select().from(schema.accounts)).filter(
      (a) => a.userId === restorer.id,
    );
    expect(restoredAccounts).toHaveLength(accountCount - 1);
    for (const account of restoredAccounts) {
      expect(account.currency).not.toBe('XYZ');
    }
  });

  it('ignores a section whose data is not an object', async () => {
    await must(harness.hooks.importHandler, 'import handler')(
      { pluginId: 'fs.sovereign.ledger', schemaVersion: 1, data: 'nonsense' },
      importContextFor(restorer),
    );
    for (const table of userScopedTables) {
      expect(await countFor(table, restorer.id)).toBe(0);
    }
  });
});
