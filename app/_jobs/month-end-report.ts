import { sdk, type ScheduleContext } from '@sovereignfs/sdk';
import { and, eq } from 'drizzle-orm';
import { currencies, monthEndNotifications } from '../_db/schema';
import { getDb } from '../_lib/db';
import { formatMoney } from '../_lib/format';
import { getPreviousYearMonth, isFirstOfMonthUtc } from '../_lib/period';
import { getReportsData, type PeriodReport } from '../_lib/reports';

const REPORTS_URL = '/ledger/reports';

/**
 * The 1st-of-month recap (L.11) — email + in-app notification. `manifest.json`
 * `schedules` entry, `intervalMinutes: 1440`; this handler's own
 * `isFirstOfMonthUtc()` gate is what makes it a once-a-month job on a
 * scheduler that only offers a fixed interval, not a day-of-month trigger.
 *
 * **`sdk.email.sendToUser()`, not `sdk.mailer.send()`** — the task's own
 * original wording named the latter, but `sdk.mailer.send()` is the
 * raw-recipient-address escape hatch requiring `mailer:sendExternal`;
 * `sdk.email.sendToUser()` is "the recommended default" for a known
 * `userId` per its own doc comment, requires only the `mailer:send`
 * permission this manifest already declares, and no-ops to
 * `{status: 'skipped'}` rather than throwing when SMTP is unconfigured —
 * exactly the review checklist's own requirement, satisfied by the SDK
 * itself with no special-casing needed here.
 *
 * **The insert into `monthEndNotifications` IS the idempotency claim**,
 * attempted only after confirming there's real data to report (skip the
 * write entirely for a user with nothing to send, rather than remembering
 * a "checked, nothing there" no-op that then loses the automatic
 * "well duplicate detection" — see below): `onConflictDoNothing` plus
 * `.returning()` tells us whether *this* invocation is the one that
 * legitimately wins the right to send, versus a concurrent invocation
 * (multiple replicas ticking independently, or a manual re-trigger) that
 * lost the race — only a winning claim proceeds to send. A cheap
 * `SELECT`-first check runs before the (comparatively expensive)
 * `getReportsData()` call purely to skip re-computing a report for users
 * already fully processed by an earlier invocation.
 *
 * **A per-user try/catch isolates one user's failure from the rest** —
 * unlike `fetch-fx-rates.ts` (L.10), where one failed batched call fails
 * the whole run safely (nothing was written yet either way), this job fans
 * out real side effects per user; letting user #3's email API hiccup throw
 * out of the loop would silently skip every remaining user's recap for the
 * entire month (the next "is it the 1st" opportunity is 30 days away, and
 * this scheduler generation has no retries at all — a real, documented v1
 * limitation, not solved here).
 *
 * Exported as `runMonthEndReport` (not just the default `ScheduleHandler`)
 * so both tests and manual live-verification can pass an explicit `now`,
 * matching every other time-dependent helper in `period.ts`.
 */
export async function runMonthEndReport(headers: Headers, now: number = Date.now()): Promise<void> {
  if (!isFirstOfMonthUtc(now)) return;

  const { year, month } = getPreviousYearMonth(now);
  const db = await getDb();

  const candidates = await db
    .select({ userId: currencies.userId, tenantId: currencies.tenantId })
    .from(currencies)
    .where(eq(currencies.isBase, 1));

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

      const { periods } = await getReportsData(db, userId);
      const period = periods.find((p) => p.year === year && p.month === month);
      if (!period) continue; // nothing happened last period — no recap to send

      const claimed = await db
        .insert(monthEndNotifications)
        .values({ tenantId, userId, year, month, sentAt: now })
        .onConflictDoNothing({
          target: [monthEndNotifications.userId, monthEndNotifications.year, monthEndNotifications.month],
        })
        .returning({ userId: monthEndNotifications.userId });
      if (claimed.length === 0) continue; // lost the race to a concurrent invocation

      await sendRecap(userId, period, headers);
    } catch (err) {
      console.error('ledger month-end-report: failed for user', userId, err);
    }
  }
}

// Server-side only — no browser to inherit a locale from, unlike every
// client-rendered date label elsewhere in this plugin (e.g.
// `MobileOverviewScreen`'s `Intl.DateTimeFormat(undefined, ...)`).
function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

async function sendRecap(userId: string, period: PeriodReport, headers: Headers): Promise<void> {
  const label = monthLabel(period.year, period.month);
  const currency = period.topCategories[0]?.currency;
  const income = formatMoney(period.incomeMinor, currency ?? 'USD');
  const spent = formatMoney(period.spentMinor, currency ?? 'USD');
  const saved = formatMoney(period.actualSavingsMinor, currency ?? 'USD');

  const subject = `Your ${label} recap`;
  const text = `Your ${label} recap: income ${income}, spent ${spent}, saved ${saved}. See the full breakdown at ${REPORTS_URL}.`;
  const html = `<p>Your <strong>${label}</strong> recap:</p><ul><li>Income: ${income}</li><li>Spent: ${spent}</li><li>Saved: ${saved}</li></ul><p><a href="${REPORTS_URL}">See the full breakdown</a></p>`;

  await sdk.email.sendToUser(
    { recipientUserId: userId, templateId: 'ledger-month-end-recap', subject, html, text },
    headers,
  );
  await sdk.notifications.send(
    {
      recipientUserId: userId,
      title: `${label} recap ready`,
      body: `Income ${income} · Spent ${spent} · Saved ${saved}`,
      url: REPORTS_URL,
      category: 'info',
    },
    headers,
  );
}

export default async function monthEndReport(ctx: ScheduleContext): Promise<void> {
  await runMonthEndReport(ctx.headers);
}
