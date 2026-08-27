/**
 * Dev seed script — a small demo budget for exercising the schema, not an
 * exhaustive UI-scenario fixture (there's no real UI yet; that richer style
 * of seed belongs to whichever later task actually builds one). Populates:
 * one base currency, one primary income, a couple of Dynamic categories and
 * one Fixed category (each with a single kind), and a handful of
 * transactions against them.
 *
 * Requires `pnpm sv seed` to have already been run once from the monorepo
 * root — this script looks up the target dev account by email, never a
 * hardcoded id, since ids are randomly generated per database:
 *   owner@sovereign.local   (the target user — sign in as this one)
 *
 * Run from this plugin's own directory (or `pnpm --filter
 * sovereign-plugin-ledger exec tsx scripts/seed.ts` from the monorepo
 * root), with the dev sqld instance already running (`pnpm dev` or `tsx
 * scripts/ensure-sqld.ts` starts it):
 *
 *   pnpm exec tsx scripts/seed.ts
 *   pnpm exec tsx scripts/seed.ts --reset   # wipe this script's own data first, then reseed
 *
 * Idempotent by default: no-ops (prints what already exists) if the seed
 * data is already present, rather than duplicating it on a second run.
 *
 * Connects directly to the dev sqld instance via `@libsql/client` rather
 * than importing `@sovereignfs/db` — this plugin's own `package.json`
 * doesn't depend on internal platform packages, mirroring
 * `sovereign-plugin-kanban.local`'s own seed script and the platform root's
 * own `scripts/seed.ts` precedent for standalone dev tooling. SQLite (sqld)
 * dev only; this plugin has no Postgres dev seed path today.
 */
import { createClient, type Client } from '@libsql/client';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../app/_db/schema';

const SQLD_URL = process.env.SOVEREIGN_SQLD_URL ?? 'http://localhost:28080';
const LEDGER_NAMESPACE = 'plugin_fs_sovereign_ledger';
const AUTH_NAMESPACE = 'sovereign_auth';
// Platform-required multi-tenancy column, constant in this v1 single-tenant
// world — NOT the per-user scoping field (see schema.ts's header comment
// and SPEC.md's Data model section). The real owner of every seeded row is
// `userId`, resolved below from the real dev account.
const TENANT_ID = 'default';
const RESET = process.argv.includes('--reset');

function namespacedClient(namespace: string): Client {
  return createClient({
    url: SQLD_URL,
    fetch: (input: unknown, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set('x-namespace', namespace);
      return fetch(input as string, { ...init, headers });
    },
  });
}

async function lookupDevUserId(): Promise<string> {
  const auth = namespacedClient(AUTH_NAMESPACE);
  const email = 'owner@sovereign.local';
  const res = await auth.execute({
    sql: `SELECT id FROM "user" WHERE email = ?`,
    args: [email],
  });
  auth.close();

  const id = res.rows[0]?.id as string | undefined;
  if (!id) {
    throw new Error(
      `Missing dev account: ${email}. Run "pnpm sv seed" from the monorepo root first, then re-run this script.`,
    );
  }
  return id;
}

// Fixed ids for every seeded row — idempotency and `--reset` both rely on
// this: deleting the currency/income/category rows cascades everything
// below them (categories → kinds → transactions, see schema.ts's
// `onDelete: 'cascade'` references).
const CURRENCY_EUR = 'seed-currency-eur';
const INCOME_PRIMARY = 'seed-income-primary';
const CATEGORY_GROCERIES = 'seed-category-groceries';
const CATEGORY_EATING_OUT = 'seed-category-eating-out';
const CATEGORY_TRANSPORT = 'seed-category-transport';
const CATEGORY_HOUSEHOLD = 'seed-category-household-bills';
const KIND_GROCERIES = 'seed-kind-groceries';
const KIND_EATING_OUT = 'seed-kind-eating-out';
const KIND_TRANSPORT = 'seed-kind-transport';
const KIND_HOUSEHOLD = 'seed-kind-household-bills';

const DAY = 24 * 60 * 60 * 1000;

async function main(): Promise<void> {
  const userId = await lookupDevUserId();
  const client = namespacedClient(LEDGER_NAMESPACE);
  const db = drizzle(client);

  if (RESET) {
    console.log('--reset: deleting prior seed data...');
    await db.delete(schema.currencies).where(eq(schema.currencies.id, CURRENCY_EUR));
    await db.delete(schema.incomes).where(eq(schema.incomes.id, INCOME_PRIMARY));
    await db
      .delete(schema.categories)
      .where(
        inArray(schema.categories.id, [
          CATEGORY_GROCERIES,
          CATEGORY_EATING_OUT,
          CATEGORY_TRANSPORT,
          CATEGORY_HOUSEHOLD,
        ]),
      );
  }

  const existing = await db
    .select({ id: schema.currencies.id })
    .from(schema.currencies)
    .where(eq(schema.currencies.id, CURRENCY_EUR));
  if (existing.length > 0) {
    console.log('Seed data already present (EUR currency exists) — nothing to do.');
    console.log('Run again with --reset to wipe and recreate it.');
    client.close();
    return;
  }

  const now = Date.now();
  const daysAgo = (n: number): number => now - n * DAY;

  await db.insert(schema.currencies).values({
    id: CURRENCY_EUR,
    tenantId: TENANT_ID,
    userId,
    code: 'EUR',
    isBase: 1,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(schema.incomes).values({
    id: INCOME_PRIMARY,
    tenantId: TENANT_ID,
    userId,
    label: 'Primary income',
    amountMinor: 420_000, // €4,200.00
    currency: 'EUR',
    kind: 'primary',
    createdAt: now,
    updatedAt: now,
  });

  async function addCategoryWithKind(input: {
    categoryId: string;
    kindId: string;
    name: string;
    type: 'dynamic' | 'fixed';
    predictedAmountMinor: number;
    recurrence?: { unit: 'month'; count: number; anchorDate: string };
  }): Promise<void> {
    await db.insert(schema.categories).values({
      id: input.categoryId,
      tenantId: TENANT_ID,
      userId,
      name: input.name,
      type: input.type,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.kinds).values({
      id: input.kindId,
      tenantId: TENANT_ID,
      userId,
      categoryId: input.categoryId,
      name: input.name,
      predictedAmountMinor: input.predictedAmountMinor,
      currency: 'EUR',
      recurrenceIntervalUnit: input.recurrence?.unit ?? null,
      recurrenceIntervalCount: input.recurrence?.count ?? null,
      recurrenceAnchorDate: input.recurrence?.anchorDate ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  await addCategoryWithKind({
    categoryId: CATEGORY_GROCERIES,
    kindId: KIND_GROCERIES,
    name: 'Groceries',
    type: 'dynamic',
    predictedAmountMinor: 15_000, // €150.00
  });
  await addCategoryWithKind({
    categoryId: CATEGORY_EATING_OUT,
    kindId: KIND_EATING_OUT,
    name: 'Eating out',
    type: 'dynamic',
    predictedAmountMinor: 15_000, // €150.00
  });
  await addCategoryWithKind({
    categoryId: CATEGORY_TRANSPORT,
    kindId: KIND_TRANSPORT,
    name: 'Transport',
    type: 'dynamic',
    predictedAmountMinor: 3_000, // €30.00
  });
  await addCategoryWithKind({
    categoryId: CATEGORY_HOUSEHOLD,
    kindId: KIND_HOUSEHOLD,
    name: 'Household bills',
    type: 'fixed',
    predictedAmountMinor: 170_000, // €1,700.00
    recurrence: { unit: 'month', count: 1, anchorDate: '2026-01-01' },
  });

  // A handful of transactions — same figures as the web-shell.md wireframe's
  // "Recent activity" section, for a consistent demo story.
  await db.insert(schema.transactions).values([
    {
      id: 'seed-txn-1',
      tenantId: TENANT_ID,
      userId,
      kindId: KIND_GROCERIES,
      amountMinor: 2_340, // €23.40
      currency: 'EUR',
      occurredAt: daysAgo(1),
      note: null,
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
    },
    {
      id: 'seed-txn-2',
      tenantId: TENANT_ID,
      userId,
      kindId: KIND_TRANSPORT,
      amountMinor: 1_100, // €11.00
      currency: 'EUR',
      occurredAt: daysAgo(2),
      note: null,
      createdAt: daysAgo(2),
      updatedAt: daysAgo(2),
    },
    {
      id: 'seed-txn-3',
      tenantId: TENANT_ID,
      userId,
      kindId: KIND_EATING_OUT,
      amountMinor: 690, // €6.90
      currency: 'EUR',
      occurredAt: daysAgo(3),
      note: null,
      createdAt: daysAgo(3),
      updatedAt: daysAgo(3),
    },
    {
      id: 'seed-txn-4',
      tenantId: TENANT_ID,
      userId,
      kindId: KIND_GROCERIES,
      amountMinor: 8_460, // €84.60 — brings Groceries to €108.00 spent, matching the wireframes
      currency: 'EUR',
      occurredAt: daysAgo(10),
      note: null,
      createdAt: daysAgo(10),
      updatedAt: daysAgo(10),
    },
  ]);

  client.close();

  console.log('Seed complete.');
  console.log('  1 currency (EUR, base), 1 primary income, 4 categories/kinds, 4 transactions.');
  console.log('');
  console.log('Sign in as owner@sovereign.local (password: sovereign) to see it at /ledger.');
}

await main();
