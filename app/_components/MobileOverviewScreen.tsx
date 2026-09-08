'use client';

import { useRouter } from 'next/navigation';
import { useFormatters } from '../_lib/locale';
import type { OverviewData } from '../_lib/overview';
import { MobileSettingsLink } from './MobileSettingsLink';
import { OverviewChecklist } from './OverviewChecklist';
import styles from './Mobile.module.css';
import { UnconvertedNote } from './UnconvertedNote';

/**
 * mobile-fork.md screen 1 — a condensed single-column dashboard: one
 * combined summary card (This month only — Net worth/Saving jars are a tap
 * away on the Accounts footer destination, not repeated here), top 2 budget
 * rows instead of 5, top 2 recent-activity rows instead of 5, and (L.13)
 * "1 insight" per the wireframe's own explicit count — desktop shows every
 * applicable one, mobile caps to the single most relevant. The checklist
 * state reuses the exact same `OverviewChecklist` desktop renders — already
 * a plain, unconstrained card with no desktop-only layout assumptions.
 */
export function MobileOverviewScreen({
  data,
  insights,
}: {
  data: OverviewData;
  insights: string[];
}) {
  const router = useRouter();
  const fmt = useFormatters();

  if (data.transactionCount === 0) {
    return <OverviewChecklist items={data.checklist} />;
  }

  const base = data.baseCurrencyCode;

  return (
    <div className={styles.screen}>
      <div className={styles.titleRow}>
        <div>
          <h1 className={styles.title}>Overview</h1>
          <p className={styles.subtitle}>{fmt.period(data.period.year, data.period.month)}</p>
        </div>
        <MobileSettingsLink />
      </div>

      <UnconvertedNote currencies={data.unconvertedCurrencies} />

      <div className={styles.card}>
        <p className={styles.cardTitle}>This month</p>
        <div className={styles.cardRow}>
          <span>Income</span>
          <span>{fmt.money(data.thisMonth.incomeMinor, base)}</span>
        </div>
        <div className={styles.cardRow}>
          <span>Budgeted</span>
          <span>{fmt.money(data.thisMonth.budgetedMinor, base)}</span>
        </div>
        <div className={styles.cardRow}>
          <span>Spent so far</span>
          <span>{fmt.money(data.thisMonth.spentMinor, base)}</span>
        </div>
        <div className={`${styles.cardRow} ${styles.cardRowTotal}`}>
          <span>Projected savings</span>
          <span>{fmt.money(data.thisMonth.projectedSavingsMinor, base)}</span>
        </div>
        <div className={styles.cardRow}>
          <span>Left this month</span>
          <span>{fmt.money(data.thisMonth.remainingMinor, base)}</span>
        </div>
      </div>

      <section>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Budget this month</h2>
          <button
            type="button"
            className={styles.link}
            onClick={() => router.push('/ledger/budget')}
          >
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
                {fmt.money(category.actualAmountMinor, category.currency)} /{' '}
                {fmt.money(category.predictedAmountMinor, category.currency)}
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
                <span className={styles.activityDate}>{fmt.day(item.occurredAt)}</span> •{' '}
                {item.source === 'jar'
                  ? `${item.categoryName} — from jar`
                  : item.categoryName === item.kindName
                    ? item.categoryName
                    : `${item.categoryName} — ${item.kindName}`}
              </span>
              <span>-{fmt.money(item.amountMinor, item.currency)}</span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
