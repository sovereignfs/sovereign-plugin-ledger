'use client';

import { Icon, StatusBadge } from '@sovereignfs/ui';
import { formatMoney } from '../_lib/format';
import type { PeriodReport, ReportsData } from '../_lib/reports';
import { MobileSettingsLink } from './MobileSettingsLink';
import { periodLabel } from './ReportsMain';
import { ReportsDetail } from './ReportsDetail';
import styles from './Mobile.module.css';

function periodKeyOf(period: PeriodReport): string {
  return `${period.year}-${period.month}`;
}

/**
 * mobile-fork.md screens 6-7 — same list+drill-down shape as Budget/
 * Accounts. The detail screen reuses `ReportsDetail` verbatim, including
 * its own "Adjust budget →" button (a plain `router.push('/ledger/budget')`
 * that works unchanged on mobile — it lands on the same footer destination).
 */
export function MobileReportsScreen({
  data,
  selected,
  insights,
  onSelect,
  onBack,
}: {
  data: ReportsData;
  selected: PeriodReport | null;
  insights: string[];
  onSelect: (period: PeriodReport) => void;
  onBack: () => void;
}) {
  if (selected) {
    return (
      <div className={styles.screen}>
        <div className={styles.backHeader}>
          <button type="button" className={styles.backButton} onClick={onBack}>
            <Icon name="chevron-left" size="sm" aria-hidden />
            Reports
          </button>
        </div>
        <ReportsDetail period={selected} baseCurrencyCode={data.baseCurrencyCode} insights={insights} />
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.titleRow}>
        <div>
          <h1 className={styles.title}>Reports</h1>
          <p className={styles.subtitle}>Monthly recap</p>
        </div>
        <MobileSettingsLink />
      </div>

      {data.periods.length === 0 ? (
        <p className={styles.emptyState}>No expense activity logged yet.</p>
      ) : (
        data.periods.map((period) => (
          <button
            key={periodKeyOf(period)}
            type="button"
            className={styles.row}
            onClick={() => onSelect(period)}
          >
            <span className={styles.rowText}>
              <span className={styles.rowTitle}>{periodLabel(period.year, period.month)}</span>
              <span className={styles.rowSubtitle}>
                Income {formatMoney(period.incomeMinor, data.baseCurrencyCode)} • Spent{' '}
                {formatMoney(period.spentMinor, data.baseCurrencyCode)}
              </span>
            </span>
            <span className={styles.rowValue}>
              <StatusBadge status={period.reviewed ? 'synced' : 'warning'}>
                {period.reviewed ? 'Reviewed' : 'Needs review'}
              </StatusBadge>
              <Icon name="chevron-right" size="sm" aria-hidden />
            </span>
          </button>
        ))
      )}
    </div>
  );
}
