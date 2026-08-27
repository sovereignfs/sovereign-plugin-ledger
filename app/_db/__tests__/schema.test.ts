/**
 * Applies the real generated SQLite migrations (migrations/sqlite/, via
 * Drizzle's own migrator — journal and all) to an ephemeral database. This
 * is the same migration path the platform runs at startup, so a malformed
 * journal or SQL file fails here first.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './test-db';

let t: TestDb;

beforeEach(async () => {
  t = await createTestDb();
});

afterEach(() => {
  t.close();
});

describe('ledger schema (real migrations, ephemeral sqlite)', () => {
  it('applies the migration folder cleanly and creates every table', async () => {
    const res = await t.client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ledger_%'",
    );
    const tables = res.rows.map((r) => String(r.name)).sort();
    expect(tables).toEqual(
      [
        'ledger_accounts',
        'ledger_assets',
        'ledger_categories',
        'ledger_currencies',
        'ledger_deposits',
        'ledger_fx_rates',
        'ledger_incomes',
        'ledger_jar_transactions',
        'ledger_kinds',
        'ledger_loans',
        'ledger_people',
        'ledger_people_transactions',
        'ledger_period_reviews',
        'ledger_saving_jars',
        'ledger_transactions',
      ].sort(),
    );
  });
});
