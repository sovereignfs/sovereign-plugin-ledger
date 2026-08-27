import { PageHeader, StatusBadge } from '@sovereignfs/ui';
import { formatMoney } from '../_lib/format';
import type { PeriodReport, ReportsData } from '../_lib/reports';
import styles from './Reports.module.css';

export function periodLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, 1),
  );
}

function periodKeyOf(period: PeriodReport): string {
  return `${period.year}-${period.month}`;
}

/**
 * web-shell.md screen 5 — month-end review lives here, not as its own
 * sidebar item; "Needs review"/"Reviewed" is a `StatusBadge` state on the
 * period itself. Every period with any transaction activity is listed,
 * including the current (still in-progress) month — nothing in the data
 * model distinguishes "this month is done" from "this month is still
 * accumulating," so there's no separate gate on which periods are
 * review-eligible; a user can mark the current month reviewed early if
 * they want to.
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
                <span className={styles.rowTitle}>{periodLabel(period.year, period.month)}</span>
                <StatusBadge status={period.reviewed ? 'synced' : 'warning'}>
                  {period.reviewed ? 'Reviewed' : 'Needs review'}
                </StatusBadge>
              </div>
              <span className={styles.rowSubtitle}>
                Income {formatMoney(period.incomeMinor, data.baseCurrencyCode)} • Spent{' '}
                {formatMoney(period.spentMinor, data.baseCurrencyCode)}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}
