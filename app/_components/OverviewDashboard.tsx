import Link from 'next/link';
import { Card, PageHeader, Progress } from '@sovereignfs/ui';
import { formatMoney } from '../_lib/format';
import type { OverviewData } from '../_lib/overview';
import styles from './Overview.module.css';

function monthLabel(): string {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date());
}

/**
 * web-shell.md screen 1. Insights and the month-end review nudge are both
 * omitted here, not stubbed — they depend on L.13 (rule-based insights) and
 * L.8 (period reviews) respectively, neither of which exists yet. The
 * wireframe's "Recent activity" also shows an illustrative income row
 * ("Salary — Primary income", +€2,400) — incomes are a declared recurring
 * amount in this data model, not a logged event, so there's no transaction
 * row to ever render for one; every real row here is a spend.
 */
export function OverviewDashboard({ data }: { data: OverviewData }) {
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
