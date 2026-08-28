'use client';

import { useRouter } from 'next/navigation';
import { formatMoney } from '../_lib/format';
import type { OverviewData } from '../_lib/overview';
import { MobileSettingsLink } from './MobileSettingsLink';
import { OverviewChecklist } from './OverviewChecklist';
import styles from './Mobile.module.css';

function monthLabel(): string {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date());
}

/**
 * mobile-fork.md screen 1 — a condensed single-column dashboard: one
 * combined summary card (This month only — Net worth/Saving jars are a tap
 * away on the Accounts footer destination, not repeated here), top 2 budget
 * rows instead of 5, top 2 recent-activity rows instead of 5, and (L.13)
 * "1 insight" per the wireframe's own explicit count — desktop shows every
 * applicable one, mobile caps to the single most relevant. The month-end
 * review nudge is omitted, same as desktop (L.5/L.8) — a deliberate desktop
 * scope cut this task doesn't retroactively revisit. The checklist state
 * reuses the exact same `OverviewChecklist` desktop renders — already a
 * plain, unconstrained card with no desktop-only layout assumptions, so a
 * second mobile variant would just be a duplicate.
 */
export function MobileOverviewScreen({
  data,
  insights,
}: {
  data: OverviewData;
  insights: string[];
}) {
  const router = useRouter();

  if (data.transactionCount === 0) {
    return <OverviewChecklist items={data.checklist} />;
  }

  const base = data.baseCurrencyCode;

  return (
    <div className={styles.screen}>
      <div className={styles.titleRow}>
        <div>
          <h1 className={styles.title}>Overview</h1>
          <p className={styles.subtitle}>{monthLabel()}</p>
        </div>
        <MobileSettingsLink />
      </div>

      <div className={styles.card}>
        <p className={styles.cardTitle}>This month</p>
        <div className={styles.cardRow}>
          <span>Income</span>
          <span>{formatMoney(data.thisMonth.incomeMinor, base)}</span>
        </div>
        <div className={styles.cardRow}>
          <span>Spent</span>
          <span>{formatMoney(data.thisMonth.spentMinor, base)}</span>
        </div>
        <div className={`${styles.cardRow} ${styles.cardRowTotal}`}>
          <span>Projected saved</span>
          <span>{formatMoney(data.thisMonth.projectedSavedMinor, base)}</span>
        </div>
      </div>

      <section>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Budget this month</h2>
          <button type="button" className={styles.link} onClick={() => router.push('/ledger/budget')}>
            View all →
          </button>
        </div>
        {data.topCategories.length === 0 ? (
          <p className={styles.emptyState}>No categories yet.</p>
        ) : (
          data.topCategories.slice(0, 2).map((category) => (
            <div key={category.categoryId} className={styles.cardRow}>
              <span>{category.name}</span>
              <span>
                {formatMoney(category.actualAmountMinor, category.currency)} /{' '}
                {formatMoney(category.predictedAmountMinor, category.currency)}
              </span>
            </div>
          ))
        )}
      </section>

      {insights.length > 0 && (
        <section>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Insights</h2>
          </div>
          <div className={styles.card}>
            <p className={styles.insightText}>{insights[0]}</p>
          </div>
        </section>
      )}

      <section>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Recent activity</h2>
        </div>
        {data.recentActivity.length === 0 ? (
          <p className={styles.emptyState}>No expenses logged this month yet.</p>
        ) : (
          data.recentActivity.slice(0, 2).map((item) => (
            <div key={item.id} className={styles.activityRow}>
              <span>
                <span className={styles.activityDate}>
                  {new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
                    new Date(item.occurredAt),
                  )}
                </span>{' '}
                • {item.categoryName === item.kindName ? item.categoryName : `${item.categoryName} — ${item.kindName}`}
              </span>
              <span>-{formatMoney(item.amountMinor, item.currency)}</span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
