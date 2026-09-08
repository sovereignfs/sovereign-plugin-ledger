'use client';

import Link from 'next/link';
import { Card, PageHeader, Progress } from '@sovereignfs/ui';
import { useFormatters } from '../_lib/locale';
import type { OverviewData } from '../_lib/overview';
import styles from './Overview.module.css';
import { UnconvertedNote } from './UnconvertedNote';

/**
 * web-shell.md screen 1. The month-end review nudge is omitted here, not
 * stubbed — Reports' own list already surfaces review status. The
 * wireframe's "Recent activity" also shows an illustrative income row
 * ("Salary — Primary income", +€2,400) — incomes are a declared recurring
 * amount in this data model, not a logged event, so there's no transaction
 * row to ever render for one; every real row here is a spend (a regular
 * expense or a jar-funded one).
 *
 * "Projected savings" is income minus everything budgeted — the same
 * definition Reports uses (an earlier version showed income minus
 * spent-so-far under that label, which read as nearly the whole income on
 * the 2nd of the month). "Left this month" is the spent-so-far figure.
 *
 * Insights (L.13) render only when there's at least one — an empty
 * Insights section reads as "nothing to flag right now," which doesn't
 * need its own empty-state placeholder the way a genuinely-empty list
 * (Recent activity, Budget this month) does.
 */
export function OverviewDashboard({ data, insights }: { data: OverviewData; insights: string[] }) {
  const fmt = useFormatters();
  const base = data.baseCurrencyCode;
  const cardUtilisationPct =
    data.creditCards.limitMinor > 0
      ? (data.creditCards.balanceMinor / data.creditCards.limitMinor) * 100
      : null;

  return (
    <div className={styles.page}>
      <PageHeader title="Overview" description={fmt.period(data.period.year, data.period.month)} />

      <UnconvertedNote currencies={data.unconvertedCurrencies} />

      <div className={styles.cardsGrid}>
        <Card padding="md">
          <p className={styles.cardTitle}>This month</p>
          <div className={styles.cardRow}>
            <span className={styles.cardRowLabel}>Income</span>
            <span className={styles.cardRowValue}>
              {fmt.money(data.thisMonth.incomeMinor, base)}
            </span>
          </div>
          <div className={styles.cardRow}>
            <span className={styles.cardRowLabel}>Budgeted</span>
            <span className={styles.cardRowValue}>
              {fmt.money(data.thisMonth.budgetedMinor, base)}
            </span>
          </div>
          <div className={styles.cardRow}>
            <span className={styles.cardRowLabel}>Spent so far</span>
            <span className={styles.cardRowValue}>
              {fmt.money(data.thisMonth.spentMinor, base)}
            </span>
          </div>
          <div className={`${styles.cardRow} ${styles.cardRowTotal}`}>
            <span className={styles.cardRowLabel}>Projected savings</span>
            <span className={styles.cardRowValue}>
              {fmt.money(data.thisMonth.projectedSavingsMinor, base)}
            </span>
          </div>
          <div className={styles.cardRow}>
            <span className={styles.cardRowLabel}>Left this month</span>
            <span className={styles.cardRowValue}>
              {fmt.money(data.thisMonth.remainingMinor, base)}
            </span>
          </div>
        </Card>

        <Card padding="md">
          <p className={styles.cardTitle}>Net worth</p>
          <div className={`${styles.cardRow} ${styles.cardRowTotal}`}>
            <span className={styles.cardRowLabel}>Total</span>
            <span className={styles.cardRowValue}>{fmt.money(data.netWorth.totalMinor, base)}</span>
          </div>
          {data.creditCards.count > 0 && (
            <div className={styles.cardRow}>
              <span className={styles.cardRowLabel}>
                Cards{cardUtilisationPct !== null && ` · ${Math.round(cardUtilisationPct)}% used`}
              </span>
              <span className={styles.cardRowValue}>
                {fmt.money(data.creditCards.balanceMinor, base)} owed
              </span>
            </div>
          )}
          {data.loans.count > 0 && (
            <div className={styles.cardRow}>
              <span className={styles.cardRowLabel}>
                {data.loans.count === 1 ? 'Loan' : `${data.loans.count} loans`}
              </span>
              <span className={styles.cardRowValue}>
                {fmt.money(data.loans.remainingMinor, base)} left
              </span>
            </div>
          )}
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
              {fmt.money(data.savingJars.totalMinor, base)}
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
                    {fmt.money(category.actualAmountMinor, category.currency)} /{' '}
                    {fmt.money(category.predictedAmountMinor, category.currency)}
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
            {insights.map((insight, index) => (
              <Card key={`${index}-${insight}`} padding="md">
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
                <span className={styles.activityDate}>{fmt.day(item.occurredAt)}</span> •{' '}
                {item.source === 'jar'
                  ? `${item.categoryName} — from jar`
                  : item.categoryName === item.kindName
                    ? item.categoryName
                    : `${item.categoryName} — ${item.kindName}`}
                {item.note && <span className={styles.activityDate}> · {item.note}</span>}
              </span>
              <span className={styles.activityAmount}>
                -{fmt.money(item.amountMinor, item.currency)}
              </span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
