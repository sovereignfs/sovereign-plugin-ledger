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
import { fxRates } from '../../_db/schema';
import { CURRENCY_OPTIONS } from '../../_lib/currency-options';

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

/** Every non-USD `CURRENCY_OPTIONS` code except LKR/AED gets a rate — mirrors Frankfurter's real coverage gap. */
const NON_PIVOT_CODES = CURRENCY_OPTIONS.map((c) => c.code).filter((c) => c !== 'USD');
const UNCOVERED = new Set(['LKR', 'AED']);
const FRANKFURTER_RATES = Object.fromEntries(
  NON_PIVOT_CODES.filter((c) => !UNCOVERED.has(c)).map((c, i) => [c, 0.5 + i * 0.1]),
);

/** `mockImplementation`, not `mockResolvedValue` — a `Response` body can only
 *  be read once; a shared instance would break any test calling the handler
 *  more than once (a fresh `Response` per call, same fixture data). */
function stubFrankfurter(rates: Record<string, number> = FRANKFURTER_RATES, date = '2026-08-27') {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => jsonResponse({ amount: 1, base: 'USD', date, rates })),
  );
}

const ctx = { pluginId: 'fs.sovereign.ledger', scheduleId: 'fetch-fx-rates', headers: new Headers() };

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
  it('fetches once with base=USD and all non-pivot supported codes as symbols', async () => {
    stubFrankfurter();
    await fetchFxRates(ctx);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [firstCall] = vi.mocked(fetch).mock.calls;
    const url = new URL(firstCall?.[0] as string);
    expect(url.searchParams.get('base')).toBe('USD');
    expect(url.searchParams.get('symbols')?.split(',').sort()).toEqual(
      [...NON_PIVOT_CODES].sort(),
    );
  });

  it('inverts Frankfurter\'s USD-per-unit rate into value-of-1-X-in-USD', async () => {
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

  it('uses Frankfurter\'s own returned date, not the current date', async () => {
    stubFrankfurter({ EUR: 0.92 }, '2026-01-02');
    await fetchFxRates(ctx);

    const [row] = await t.db.select().from(fxRates);
    expect(row?.asOfDate).toBe('2026-01-02');
  });

  it('skips a currency Frankfurter did not return, without crashing', async () => {
    stubFrankfurter();
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
    await fetchFxRates(ctx);
    await fetchFxRates(ctx);

    const rows = await t.db.select().from(fxRates).orderBy(asc(fxRates.currencyCode));
    const eurRows = rows.filter((r) => r.currencyCode === 'EUR');
    expect(eurRows).toHaveLength(1);
    expect(rows).toHaveLength(NON_PIVOT_CODES.length - UNCOVERED.size);
  });

  it('a second run on a later date adds new rows alongside the earlier day\'s, not replacing them', async () => {
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 500)));
    await expect(fetchFxRates(ctx)).rejects.toThrow();

    const rows = await t.db.select().from(fxRates);
    expect(rows).toHaveLength(0);
  });
});
