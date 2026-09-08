import { sdk, type ScheduleContext } from '@sovereignfs/sdk';
import { and, eq } from 'drizzle-orm';
import { currencies, monthEndNotifications } from '../_db/schema';
import { getDb } from '../_lib/db';
import { formatMoney, formatPeriod } from '../_lib/format';
import { getPreviousYearMonth } from '../_lib/period';
import { getReportsData, type PeriodReport } from '../_lib/reports';

const REPORTS_PATH = '/ledger/reports';

/**
 * The month-end recap (L.11) — email + in-app notification for the month
 * that just closed. `manifest.json` `schedules` entry, `intervalMinutes:
 * 1440`.
 *
 * **Runs on any tick, not only on the 1st.** The scheduler's interval is a
 * floor, a restart re-arms every schedule, and a replica that was down on
 * the 1st would otherwise skip the recap for a whole month — an earlier
 * version gated on `isFirstOfMonthUtc()` and had exactly that failure mode.
 * The `ledger_month_end_notifications` marker already makes each
 * `(user, year, month)` send-once, so the correct gate is simply "does last
 * month have a marker yet"; in steady state that's true on the first tick
 * after midnight UTC on the 1st, and after an outage it's true on the
 * first tick back.
 *
 * **`sdk.email.sendToUser()`, not `sdk.mailer.send()`** — the recommended
 * default for a known `userId`, requires only the `mailer:send` permission
 * this manifest declares, and no-ops to `{status: 'skipped'}` rather than
 * throwing when SMTP is unconfigured.
 *
 * **The insert into `monthEndNotifications` IS the idempotency claim**,
 * attempted only after confirming there's real data to report:
 * `onConflictDoNothing` plus `.returning()` tells us whether *this*
 * invocation wins the right to send versus a concurrent one (multiple
 * replicas ticking independently) that lost the race. A cheap SELECT-first
 * check runs before the comparatively expensive `getReportsData()` purely
 * to skip users already processed.
 *
 * **A per-user try/catch isolates one user's failure from the rest** —
 * this job fans out real side effects per user; letting user #3's email
 * hiccup throw out of the loop would skip every remaining user. There are
 * no retries once a claim is made (a documented v1 limitation).
 *
 * Exported as `runMonthEndReport` so tests and manual live-verification
 * can pass an explicit `now`.
 */
export async function runMonthEndReport(headers: Headers, now: number = Date.now()): Promise<void> {
  const { year, month } = getPreviousYearMonth(now);
  const db = await getDb();

  const candidates = await db
    .select({ userId: currencies.userId, tenantId: currencies.tenantId })
    .from(currencies)
    .where(eq(currencies.isBase, 1));
  if (candidates.length === 0) return;

  // One absolute origin for every recipient — a relative `/ledger/reports`
  // is a dead link in a mail client.
  const { instanceUrl } = await sdk.platform.getConfig();
  const reportsUrl = new URL(REPORTS_PATH, instanceUrl).toString();

  for (const { userId, tenantId } of candidates) {
    try {
      const [existing] = await db
        .select({ userId: monthEndNotifications.userId })
        .from(monthEndNotifications)
        .where(
          and(
            eq(monthEndNotifications.userId, userId),
            eq(monthEndNotifications.year, year),
            eq(monthEndNotifications.month, month),
          ),
        );
      if (existing) continue;

      const { periods, baseCurrencyCode } = await getReportsData(db, userId, now);
      const period = periods.find((p) => p.year === year && p.month === month);
      if (!period) continue; // nothing happened last period — no recap to send

      const claimed = await db
        .insert(monthEndNotifications)
        .values({ tenantId, userId, year, month, sentAt: now })
        .onConflictDoNothing({
          target: [
            monthEndNotifications.userId,
            monthEndNotifications.year,
            monthEndNotifications.month,
          ],
        })
        .returning({ userId: monthEndNotifications.userId });
      if (claimed.length === 0) continue; // lost the race to a concurrent invocation

      await sendRecap(userId, period, baseCurrencyCode, reportsUrl, headers);
    } catch (err) {
      console.error('ledger month-end-report: failed for user', userId, err);
    }
  }
}

// Server-side only — no browser to inherit a locale from, so the recap is
// formatted with a fixed locale rather than the runtime default.
const RECAP_LOCALE = 'en-US';

async function sendRecap(
  userId: string,
  period: PeriodReport,
  baseCurrencyCode: string,
  reportsUrl: string,
  headers: Headers,
): Promise<void> {
  const label = formatPeriod(period.year, period.month, RECAP_LOCALE);
  // Income/spent/saved are base-currency totals (`getReportsData`), so they
  // are formatted in the base currency — never a category's own currency.
  const income = formatMoney(period.incomeMinor, baseCurrencyCode, RECAP_LOCALE);
  const spent = formatMoney(period.spentMinor, baseCurrencyCode, RECAP_LOCALE);
  const saved = formatMoney(period.actualSavingsNetOfJarsMinor, baseCurrencyCode, RECAP_LOCALE);

  const subject = `Your ${label} recap`;
  const text = `Your ${label} recap: income ${income}, spent ${spent}, saved ${saved}. See the full breakdown at ${reportsUrl}.`;
  const html = `<p>Your <strong>${label}</strong> recap:</p><ul><li>Income: ${income}</li><li>Spent: ${spent}</li><li>Saved: ${saved}</li></ul><p><a href="${reportsUrl}">See the full breakdown</a></p>`;

  await sdk.email.sendToUser(
    { recipientUserId: userId, templateId: 'ledger-month-end-recap', subject, html, text },
    headers,
  );
  await sdk.notifications.send(
    {
      recipientUserId: userId,
      title: `${label} recap ready`,
      body: `Income ${income} · Spent ${spent} · Saved ${saved}`,
      url: REPORTS_PATH,
      category: 'info',
    },
    headers,
  );
}

export default async function monthEndReport(ctx: ScheduleContext): Promise<void> {
  await runMonthEndReport(ctx.headers);
}
