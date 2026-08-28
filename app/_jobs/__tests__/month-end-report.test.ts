/**
 * L.11 review checklist: triggering the handler manually in dev produces
 * one email and one notification, not a duplicate on a second trigger
 * within the same period; email renders sensibly with SMTP unconfigured
 * (a `{status: 'skipped'}` result, never thrown) — asserted here by never
 * branching on the email result at all and confirming the notification +
 * marker row still land regardless. Runs against the real generated
 * migrations with `sdk.db.getClient()` mocked to the test DB and
 * `sdk.email.sendToUser`/`sdk.notifications.send` mocked to inspectable
 * spies.
 */
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../_db/__tests__/test-db';
import * as schema from '../../_db/schema';

const harness = vi.hoisted(() => ({ dbClient: null as unknown }));

const sendToUser = vi.hoisted(() =>
  vi.fn(async (_input: unknown, _headers?: Headers) => ({
    status: 'sent' as 'sent' | 'skipped' | 'failed',
    errorCode: undefined as string | undefined,
  })),
);
const sendNotification = vi.hoisted(() => vi.fn(async (_input: unknown, _headers?: Headers) => undefined));

vi.mock('@sovereignfs/sdk', () => ({
  sdk: {
    db: { getClient: vi.fn(async () => harness.dbClient) },
    email: { sendToUser },
    notifications: { send: sendNotification },
  },
}));

import { runMonthEndReport } from '../month-end-report';

const tenantId = 'default';
const headers = new Headers();

// The 1st of September — "last period" is August.
const SEPT_1 = Date.UTC(2026, 8, 1, 3, 0, 0);
const AUGUST_15 = Date.UTC(2026, 7, 15);

let t: TestDb;

async function seedUserWithAugustActivity(userId: string) {
  const now = Date.now();
  await t.db.insert(schema.currencies).values({
    id: `cur-${userId}`,
    tenantId,
    userId,
    code: 'EUR',
    isBase: 1,
    createdAt: now,
    updatedAt: now,
  });
  await t.db.insert(schema.incomes).values({
    id: `inc-${userId}`,
    tenantId,
    userId,
    label: 'Primary',
    amountMinor: 400_000,
    currency: 'EUR',
    kind: 'primary',
    createdAt: now,
    updatedAt: now,
  });
  await t.db.insert(schema.categories).values({
    id: `cat-${userId}`,
    tenantId,
    userId,
    name: 'Groceries',
    type: 'dynamic',
    createdAt: now,
    updatedAt: now,
  });
  await t.db.insert(schema.kinds).values({
    id: `kind-${userId}`,
    tenantId,
    userId,
    categoryId: `cat-${userId}`,
    name: 'Groceries',
    predictedAmountMinor: 15_000,
    currency: 'EUR',
    recurrenceIntervalUnit: null,
    recurrenceIntervalCount: null,
    recurrenceAnchorDate: null,
    createdAt: now,
    updatedAt: now,
  });
  await t.db.insert(schema.transactions).values({
    id: `tx-${userId}`,
    tenantId,
    userId,
    kindId: `kind-${userId}`,
    amountMinor: 10_000,
    currency: 'EUR',
    occurredAt: AUGUST_15,
    note: null,
    createdAt: now,
    updatedAt: now,
  });
}

/** Just a base currency, no transactions at all — nothing to recap. */
async function seedUserWithNoActivity(userId: string) {
  const now = Date.now();
  await t.db.insert(schema.currencies).values({
    id: `cur-${userId}`,
    tenantId,
    userId,
    code: 'EUR',
    isBase: 1,
    createdAt: now,
    updatedAt: now,
  });
}

beforeEach(async () => {
  t = await createTestDb();
  harness.dbClient = t.ledger;
  sendToUser.mockClear();
  sendNotification.mockClear();
});

afterEach(() => {
  t.close();
});

describe('runMonthEndReport', () => {
  it('no-ops on any day other than the 1st, without touching the DB', async () => {
    await seedUserWithAugustActivity('user-1');
    const notFirst = Date.UTC(2026, 8, 2);

    await runMonthEndReport(headers, notFirst);

    expect(sendToUser).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('sends one email and one notification for a user with last month\'s activity', async () => {
    await seedUserWithAugustActivity('user-1');

    await runMonthEndReport(headers, SEPT_1);

    expect(sendToUser).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const [emailInput] = sendToUser.mock.calls[0] ?? [];
    expect(emailInput).toMatchObject({ recipientUserId: 'user-1', subject: 'Your August 2026 recap' });
    const [notificationInput] = sendNotification.mock.calls[0] ?? [];
    expect(notificationInput).toMatchObject({ recipientUserId: 'user-1', url: '/ledger/reports' });

    const [row] = await t.db
      .select()
      .from(schema.monthEndNotifications)
      .where(
        and(
          eq(schema.monthEndNotifications.userId, 'user-1'),
          eq(schema.monthEndNotifications.year, 2026),
          eq(schema.monthEndNotifications.month, 8),
        ),
      );
    expect(row).toBeDefined();
  });

  it('skips a user with no transactions last period — no email, no notification, no marker row', async () => {
    await seedUserWithNoActivity('user-2');

    await runMonthEndReport(headers, SEPT_1);

    expect(sendToUser).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
    const rows = await t.db.select().from(schema.monthEndNotifications);
    expect(rows).toHaveLength(0);
  });

  it('running twice for the same period sends exactly one recap, not two', async () => {
    await seedUserWithAugustActivity('user-1');

    await runMonthEndReport(headers, SEPT_1);
    await runMonthEndReport(headers, SEPT_1);

    expect(sendToUser).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it('still sends the notification and inserts the marker when email delivery is skipped (SMTP unconfigured)', async () => {
    sendToUser.mockResolvedValueOnce({ status: 'skipped', errorCode: 'SMTP_NOT_CONFIGURED' });
    await seedUserWithAugustActivity('user-1');

    await runMonthEndReport(headers, SEPT_1);

    expect(sendNotification).toHaveBeenCalledTimes(1);
    const rows = await t.db.select().from(schema.monthEndNotifications);
    expect(rows).toHaveLength(1);
  });

  it('one user\'s send failure does not prevent another user\'s recap', async () => {
    // Rejects whichever user's email is attempted first — candidate order
    // isn't guaranteed, so the assertions below don't depend on which one.
    sendToUser.mockRejectedValueOnce(new Error('mail provider down'));
    await seedUserWithAugustActivity('user-1');
    await seedUserWithAugustActivity('user-2');

    await runMonthEndReport(headers, SEPT_1);

    expect(sendToUser).toHaveBeenCalledTimes(2);
    // Only the user whose email call didn't throw gets a notification.
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it('claims the period for a user even when their send then fails — a documented no-retry limitation, not a bug', async () => {
    // The claim insert happens before sending (required to avoid a
    // cross-replica double-send race per the scheduler docs' own "claim
    // before acting" guidance) — so a failed send still consumes this
    // period's claim. This scheduler generation has no retries at all
    // (see the job's own doc comment); a real failure here means no recap
    // until next month, same class of limitation as L.10's job.
    sendToUser.mockRejectedValueOnce(new Error('mail provider down'));
    await seedUserWithAugustActivity('user-1');

    await runMonthEndReport(headers, SEPT_1);

    const rows = await t.db.select().from(schema.monthEndNotifications);
    expect(rows).toHaveLength(1);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
