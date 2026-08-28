import Link from 'next/link';
import { Card, PageHeader, Progress } from '@sovereignfs/ui';
import { formatMoney } from '../_lib/format';
import type { OverviewData } from '../_lib/overview';
import styles from './Overview.module.css';

function monthLabel(): string {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date());
}

/**
 * web-shell.md screen 1. The month-end review nudge is omitted here, not
 * stubbed — L.8's period reviews have no "needs attention" signal
 * meaningful on Overview specifically (Reports' own list already surfaces
 * this). The wireframe's "Recent activity" also shows an illustrative
 * income row ("Salary — Primary income", +€2,400) — incomes are a
 * declared recurring amount in this data model, not a logged event, so
 * there's no transaction row to ever render for one; every real row here
 * is a spend.
 *
 * Insights (L.13) render only when there's at least one — an empty
 * Insights section reads as "nothing to flag right now," which doesn't
 * need its own empty-state placeholder the way a genuinely-empty list
 * (Recent activity, Budget this month) does.
 */
export function OverviewDashboard({ data, insights }: { data: OverviewData; insights: string[] }) {
  const base = data.baseCurrencyCode;

  return (
    <div className={styles.page}>
      <PageHeader title="Overview" description={monthLabel()} />

      <div className={styles.cardsGrid}>
        <Card padding="md">
          <p className={styles.cardTitle}>This month</p>
          <div className={styles.cardRow}>
            <span className={styles.cardRowLabel}>Income</span>
            <span className={styles.cardRowValue}>{formatMoney(data.thisMonth.incomeMinor, base)}</span>
          </div>
          <div className={styles.cardRow}>
            <span className={styles.cardRowLabel}>Spent</span>
            <span className={styles.cardRowValue}>{formatMoney(data.thisMonth.spentMinor, base)}</span>
          </div>
          <div className={`${styles.cardRow} ${styles.cardRowTotal}`}>
            <span className={styles.cardRowLabel}>Projected saved</span>
            <span className={styles.cardRowValue}>
              {formatMoney(data.thisMonth.projectedSavedMinor, base)}
            </span>
          </div>
        </Card>

        <Card padding="md">
          <p className={styles.cardTitle}>Net worth</p>
          <div className={`${styles.cardRow} ${styles.cardRowTotal}`}>
            <span className={styles.cardRowLabel}>Total</span>
            <span className={styles.cardRowValue}>{formatMoney(data.netWorth.totalMinor, base)}</span>
          </div>
        </Card>

        <Card padding="md">
          <p className={styles.cardTitle}>Saving jars</p>
          <div className={styles.cardRow}>
            <span className={styles.cardRowLabel}>Jars</span>
            <span className={styles.cardRowValue}>{data.savingJars.jarCount}</span>
          </div>
          <div className={`${styles.cardRow} ${styles.cardRowTotal}`}>
            <span className={styles.cardRowLabel}>Total saved</span>
            <span className={styles.cardRowValue}>
              {formatMoney(data.savingJars.totalMinor, base)}
            </span>
          </div>
        </Card>
      </div>

      <section>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Budget this month</h2>
          <Link href="/ledger/budget" className={styles.viewAllLink}>
            View full budget →
          </Link>
        </div>
        {data.topCategories.length === 0 ? (
          <p className={styles.placeholder}>No categories yet.</p>
        ) : (
          data.topCategories.map((category) => {
            const over = category.actualAmountMinor > category.predictedAmountMinor;
            const pct =
              category.predictedAmountMinor > 0
                ? (category.actualAmountMinor / category.predictedAmountMinor) * 100
                : 0;
            return (
              <div key={category.categoryId} className={styles.budgetRow}>
                <div className={styles.budgetRowHeader}>
                  <span className={styles.budgetRowName}>{category.name}</span>
                  <span className={over ? styles.budgetRowOver : styles.budgetRowAmounts}>
                    {formatMoney(category.actualAmountMinor, category.currency)} /{' '}
                    {formatMoney(category.predictedAmountMinor, category.currency)}
                    {over && ' · over'}
                  </span>
                </div>
                <Progress value={pct} label={`${category.name} budget used`} />
              </div>
            );
          })
        )}
      </section>

      {insights.length > 0 && (
        <section>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Insights</h2>
          </div>
          <div className={styles.insightsList}>
            {insights.map((insight) => (
              <Card key={insight} padding="md">
                <p className={styles.insightText}>{insight}</p>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Recent activity</h2>
        </div>
        {data.recentActivity.length === 0 ? (
          <p className={styles.placeholder}>No expenses logged this month yet.</p>
        ) : (
          data.recentActivity.map((item) => (
            <div key={item.id} className={styles.activityRow}>
              <span className={styles.activityLabel}>
                <span className={styles.activityDate}>
                  {new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
                    new Date(item.occurredAt),
                  )}
                </span>{' '}
                • {item.categoryName === item.kindName ? item.categoryName : `${item.categoryName} — ${item.kindName}`}
              </span>
              <span className={styles.activityAmount}>
                -{formatMoney(item.amountMinor, item.currency)}
              </span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
