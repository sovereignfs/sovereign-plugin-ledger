'use client';

import { PageHeader, StatusBadge } from '@sovereignfs/ui';
import { useFormatters } from '../_lib/locale';
import type { PeriodReport, ReportsData } from '../_lib/reports';
import styles from './Reports.module.css';

function periodKeyOf(period: PeriodReport): string {
  return `${period.year}-${period.month}`;
}

/** The review-status badge shared by the period list, the detail header,
 *  and the mobile list — a month still accumulating is "In progress",
 *  never a warning: there's nothing to review yet. */
export function PeriodStatusBadge({ period }: { period: PeriodReport }) {
  if (period.isCurrent) return <StatusBadge status="draft">In progress</StatusBadge>;
  return (
    <StatusBadge status={period.reviewed ? 'synced' : 'warning'}>
      {period.reviewed ? 'Reviewed' : 'Needs review'}
    </StatusBadge>
  );
}

/**
 * web-shell.md screen 5 — month-end review lives here, not as its own
 * sidebar item; review status is a `StatusBadge` state on the period
 * itself. Every period with any activity is listed, including the current
 * (still in-progress) month, which is shown as such rather than as needing
 * review — `markPeriodReviewed` rejects it until it ends.
 */
export function ReportsMain({
  data,
  selectedKey,
  onSelect,
}: {
  data: ReportsData;
  selectedKey: string | null;
  onSelect: (period: PeriodReport) => void;
}) {
  const fmt = useFormatters();
  return (
    <div className={styles.page}>
      <PageHeader title="Reports" description="Monthly recap" />
      {data.periods.length === 0 ? (
        <p className={styles.emptyState}>No expense activity logged yet.</p>
      ) : (
        data.periods.map((period) => {
          const key = periodKeyOf(period);
          return (
            <button
              key={key}
              type="button"
              className={[styles.row, key === selectedKey ? styles.rowSelected : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelect(period)}
              aria-pressed={key === selectedKey}
            >
              <div className={styles.rowHeader}>
                <span className={styles.rowTitle}>{fmt.period(period.year, period.month)}</span>
                <PeriodStatusBadge period={period} />
              </div>
              <span className={styles.rowSubtitle}>
                Income {fmt.money(period.incomeMinor, data.baseCurrencyCode)} • Spent{' '}
                {fmt.money(period.spentMinor, data.baseCurrencyCode)}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}
