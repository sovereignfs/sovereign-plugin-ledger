/**
 * L.10 review checklist: running the handler twice in the same day inserts
 * exactly one row per currency, not two; a currency Frankfurter doesn't
 * cover (LKR, AED — confirmed against its real `/v1/currencies` endpoint,
 * see the handler's own doc comment) is skipped, not a crash. Runs against
 * the real generated migrations (the unique index this job's idempotency
 * depends on) with `sdk.db.getClient()` mocked to the test DB and
 * `global.fetch` mocked to a fixed Frankfurter-shaped response.
 */
import { asc } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../_db/__tests__/test-db';
import { currencies, fxRates } from '../../_db/schema';

const harness = vi.hoisted(() => ({ dbClient: null as unknown }));

vi.mock('@sovereignfs/sdk', () => ({
  sdk: { db: { getClient: vi.fn(async () => harness.dbClient) } },
}));

import fetchFxRates from '../fetch-fx-rates';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * The currencies this instance's users have actually added — the job's wanted
 * set is now `SELECT DISTINCT code FROM ledger_currencies`, not the whole
 * supported list (which is ICU's full ISO 4217 set plus BTC, 163 codes).
 * Two users deliberately share EUR so the DISTINCT is exercised.
 */
const IN_USE: Array<{ user: string; code: string }> = [
  { user: 'user-1', code: 'USD' },
  { user: 'user-1', code: 'EUR' },
  { user: 'user-1', code: 'GBP' },
  { user: 'user-1', code: 'JPY' },
  { user: 'user-1', code: 'LKR' }, // not in Frankfurter's coverage
  { user: 'user-2', code: 'EUR' }, // same code, second user
  { user: 'user-2', code: 'AED' }, // not in Frankfurter's coverage
];

const NON_PIVOT_CODES = [...new Set(IN_USE.map((c) => c.code))].filter((c) => c !== 'USD');
const UNCOVERED = new Set(['LKR', 'AED']);
const FRANKFURTER_RATES = Object.fromEntries(
  NON_PIVOT_CODES.filter((c) => !UNCOVERED.has(c)).map((c, i) => [c, 0.5 + i * 0.1]),
);

/** Seeds `ledger_currencies`, which is what the job reads to decide its wanted set. */
async function seedInUse(rows: Array<{ user: string; code: string }> = IN_USE) {
  if (rows.length === 0) return;
  const now = Date.now();
  await t.db.insert(currencies).values(
    rows.map((r, i) => ({
      id: `cur-${i}`,
      tenantId: 'tenant-1',
      userId: r.user,
      code: r.code,
      isBase: r.code === 'USD' ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    })),
  );
}

/** `mockImplementation`, not `mockResolvedValue` — a `Response` body can only
 *  be read once; a shared instance would break any test calling the handler
 *  more than once (a fresh `Response` per call, same fixture data). */
function stubFrankfurter(rates: Record<string, number> = FRANKFURTER_RATES, date = '2026-08-27') {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => jsonResponse({ amount: 1, base: 'USD', date, rates })),
  );
}

const ctx = {
  pluginId: 'fs.sovereign.ledger',
  scheduleId: 'fetch-fx-rates',
  headers: new Headers(),
};

let t: TestDb;

beforeEach(async () => {
  t = await createTestDb();
  harness.dbClient = t.ledger;
});

afterEach(() => {
  t.close();
  vi.unstubAllGlobals();
});

describe('fetchFxRates', () => {
  it('fetches once with base=USD and no symbols filter', async () => {
    stubFrankfurter();
    await seedInUse();
    await fetchFxRates(ctx);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [firstCall] = vi.mocked(fetch).mock.calls;
    const url = new URL(firstCall?.[0] as string);
    expect(url.searchParams.get('base')).toBe('USD');
    // Naming symbols staked the whole request — and therefore every currency
    // conversion in the app — on how the upstream treats a code it does not
    // cover (LKR, AED). Nothing is named, and the response is filtered here.
    expect(url.searchParams.has('symbols')).toBe(false);
  });

  it('keeps only supported currencies from a response that carries extras', async () => {
    await seedInUse();
    stubFrankfurter({ EUR: 0.92, ZZZ: 3, XAU: 0.0004 });
    await fetchFxRates(ctx);

    const codes = (await t.db.select().from(fxRates)).map((r) => r.currencyCode);
    expect(codes).toContain('EUR');
    expect(codes).not.toContain('ZZZ');
    expect(codes).not.toContain('XAU');
  });

  it('skips a zero or non-numeric quote instead of storing Infinity', async () => {
    await seedInUse();
    stubFrankfurter({ EUR: 0, GBP: 'oops' as unknown as number, JPY: 150 });
    await fetchFxRates(ctx);

    const rows = await t.db.select().from(fxRates);
    const codes = rows.map((r) => r.currencyCode);
    expect(codes).not.toContain('EUR');
    expect(codes).not.toContain('GBP');
    expect(codes).toContain('JPY');
    for (const row of rows) {
      expect(Number.isFinite(row.rate)).toBe(true);
    }
  });

  it("inverts Frankfurter's USD-per-unit rate into value-of-1-X-in-USD", async () => {
    await seedInUse();
    stubFrankfurter({ EUR: 0.92 });
    await fetchFxRates(ctx);

    const rows = await t.db.select().from(fxRates);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      currencyCode: 'EUR',
      pivotCode: 'USD',
      source: 'frankfurter',
      asOfDate: '2026-08-27',
    });
    expect(rows[0]?.rate).toBeCloseTo(1 / 0.92);
  });

  it("uses Frankfurter's own returned date, not the current date", async () => {
    await seedInUse();
    stubFrankfurter({ EUR: 0.92 }, '2026-01-02');
    await fetchFxRates(ctx);

    const [row] = await t.db.select().from(fxRates);
    expect(row?.asOfDate).toBe('2026-01-02');
  });

  it('skips a currency Frankfurter did not return, without crashing', async () => {
    stubFrankfurter();
    await seedInUse();
    await fetchFxRates(ctx);

    const rows = await t.db.select().from(fxRates);
    const codes = rows.map((r) => r.currencyCode);
    expect(codes).not.toContain('LKR');
    expect(codes).not.toContain('AED');
    expect(codes).not.toContain('USD');
    expect(rows).toHaveLength(NON_PIVOT_CODES.length - UNCOVERED.size);
  });

  it('running twice the same day inserts exactly one row per currency, not two', async () => {
    stubFrankfurter();
    await seedInUse();
    await fetchFxRates(ctx);
    await fetchFxRates(ctx);

    const rows = await t.db.select().from(fxRates).orderBy(asc(fxRates.currencyCode));
    const eurRows = rows.filter((r) => r.currencyCode === 'EUR');
    expect(eurRows).toHaveLength(1);
    expect(rows).toHaveLength(NON_PIVOT_CODES.length - UNCOVERED.size);
  });

  it("a second run on a later date adds new rows alongside the earlier day's, not replacing them", async () => {
    await seedInUse();
    stubFrankfurter({ EUR: 0.92 }, '2026-08-27');
    await fetchFxRates(ctx);
    stubFrankfurter({ EUR: 0.93 }, '2026-08-28');
    await fetchFxRates(ctx);

    const rows = await t.db.select().from(fxRates).orderBy(asc(fxRates.asOfDate));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ asOfDate: '2026-08-27' });
    expect(rows[1]).toMatchObject({ asOfDate: '2026-08-28' });
  });

  it('throws on a non-ok Frankfurter response rather than silently writing nothing', async () => {
    await seedInUse();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 500)));
    await expect(fetchFxRates(ctx)).rejects.toThrow();

    const rows = await t.db.select().from(fxRates);
    expect(rows).toHaveLength(0);
  });

  it('asks for nothing at all when no user has added a currency', async () => {
    stubFrankfurter();
    await fetchFxRates(ctx);

    // The point of reading the database first: a fresh instance makes no
    // outbound request and stores nothing, rather than fetching a few hundred
    // rates nobody can use.
    expect(fetch).not.toHaveBeenCalled();
    expect(await t.db.select().from(fxRates)).toHaveLength(0);
  });

  it('stores rates only for currencies someone added, not the whole supported list', async () => {
    await seedInUse();
    // NZD is a supported currency that no user here has added, and the
    // upstream returns it regardless.
    stubFrankfurter({ EUR: 0.92, GBP: 0.79, JPY: 150, NZD: 1.65, CHF: 0.88 });
    await fetchFxRates(ctx);

    const codes = (await t.db.select().from(fxRates)).map((r) => r.currencyCode).sort();
    expect(codes).toEqual(['EUR', 'GBP', 'JPY']);
  });

  it('counts a currency once when several users share it', async () => {
    await seedInUse();
    stubFrankfurter({ EUR: 0.92 });
    await fetchFxRates(ctx);

    // EUR is added by both users; the wanted set is DISTINCT, and the unique
    // index would reject a duplicate row anyway.
    const eur = (await t.db.select().from(fxRates)).filter((r) => r.currencyCode === 'EUR');
    expect(eur).toHaveLength(1);
  });
});
