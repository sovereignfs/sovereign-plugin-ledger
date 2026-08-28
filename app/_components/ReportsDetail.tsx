'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useActionState } from 'react';
import { Button, Card, StatusBadge } from '@sovereignfs/ui';
import { markPeriodReviewed } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import { formatMoney } from '../_lib/format';
import type { PeriodReport } from '../_lib/reports';
import { periodLabel } from './ReportsMain';
import styles from './Reports.module.css';

/**
 * The three savings figures + category breakdown for a selected period.
 * `insights` (L.13) is the same current, un-scoped-to-this-period list
 * `getInsights` returns everywhere else — not recomputed "as of" this
 * specific period from historical data, a deliberate simplification for a
 * "small rule set" feature (see `insights.ts`'s own doc comment).
 */
export function ReportsDetail({
  period,
  baseCurrencyCode,
  insights,
}: {
  period: PeriodReport;
  baseCurrencyCode: string;
  insights: string[];
}) {
  const router = useRouter();
  const [state, dispatch, pending] = useActionState<ActionResult | null, undefined>(async () => {
    const result = await markPeriodReviewed({ year: period.year, month: period.month });
    if (result.ok) router.refresh();
    return result;
  }, null);

  return (
    <div>
      <div className={styles.detailHeader}>
        <h2 className={styles.detailTitle}>{periodLabel(period.year, period.month)}</h2>
        <StatusBadge status={period.reviewed ? 'synced' : 'warning'}>
          {period.reviewed ? 'Reviewed' : 'Needs review'}
        </StatusBadge>
      </div>
      <div className={styles.detailBody}>
        <div className={styles.statGrid}>
          <div>
            <p className={styles.statLabel}>Projected savings</p>
            <p className={styles.statValue}>
              {formatMoney(period.projectedSavingsMinor, baseCurrencyCode)}
            </p>
          </div>
          <div>
            <p className={styles.statLabel}>Actual savings</p>
            <p className={styles.statValue}>
              {formatMoney(period.actualSavingsMinor, baseCurrencyCode)}
            </p>
          </div>
          <div>
            <p className={styles.statLabel}>Actual, net of jars</p>
            <p className={styles.statValue}>
              {formatMoney(period.actualSavingsNetOfJarsMinor, baseCurrencyCode)}
            </p>
          </div>
        </div>

        <section>
          <p className={styles.sectionLabel}>Top categories</p>
          {period.topCategories.length === 0 ? (
            <p className={styles.emptyState}>No spending logged this period.</p>
          ) : (
            period.topCategories.map((category) => (
              <div key={category.categoryId} className={styles.categoryRow}>
                <span>
                  <span className={styles.categoryName}>{category.name}</span>
                  {category.varianceLabel && (
                    <span
                      className={[
                        styles.categoryVariance,
                        category.varianceLabel.startsWith('+') ? styles.categoryVarianceOver : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {category.varianceLabel}
                    </span>
                  )}
                </span>
                <span className={styles.categoryAmount}>
                  {formatMoney(category.actualMinor, category.currency)}
                </span>
              </div>
            ))
          )}
        </section>

        {insights.length > 0 && (
          <section>
            <p className={styles.sectionLabel}>Insights</p>
            <div className={styles.insightsList}>
              {insights.map((insight) => (
                <Card key={insight} padding="md">
                  <p className={styles.insightText}>{insight}</p>
                </Card>
              ))}
            </div>
          </section>
        )}

        {state && !state.ok && <p>{state.error}</p>}

        <div className={styles.actions}>
          <Button
            onClick={() => startTransition(() => dispatch(undefined))}
            loading={pending}
            disabled={period.reviewed || pending}
          >
            {period.reviewed ? 'Reviewed' : 'Mark as reviewed'}
          </Button>
          <Button variant="secondary" onClick={() => router.push('/ledger/budget')}>
            Adjust budget →
          </Button>
        </div>
      </div>
    </div>
  );
}
