'use client';

import { Icon } from '@sovereignfs/ui';
import { useFormatters } from '../_lib/locale';
import type { PeriodReport, ReportsData } from '../_lib/reports';
import { MobileSettingsLink } from './MobileSettingsLink';
import { PeriodStatusBadge } from './ReportsMain';
import { ReportsDetail } from './ReportsDetail';
import styles from './Mobile.module.css';

function periodKeyOf(period: PeriodReport): string {
  return `${period.year}-${period.month}`;
}

/**
 * mobile-fork.md screens 6-7 — same list+drill-down shape as Budget/
 * Accounts, opening on the list. The detail screen reuses `ReportsDetail`
 * verbatim, including its own "Adjust budget →" button (a plain
 * `router.push('/ledger/budget')` that lands on the same footer
 * destination on mobile).
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
  const fmt = useFormatters();

  if (selected) {
    return (
      <div className={styles.screen}>
        <div className={styles.backHeader}>
          <button type="button" className={styles.backButton} onClick={onBack}>
            <Icon name="chevron-left" size="sm" aria-hidden />
            Reports
          </button>
        </div>
        <ReportsDetail
          period={selected}
          baseCurrencyCode={data.baseCurrencyCode}
          insights={insights}
        />
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
              <span className={styles.rowTitle}>{fmt.period(period.year, period.month)}</span>
              <span className={styles.rowSubtitle}>
                Income {fmt.money(period.incomeMinor, data.baseCurrencyCode)} • Spent{' '}
                {fmt.money(period.spentMinor, data.baseCurrencyCode)}
              </span>
            </span>
            <span className={styles.rowValue}>
              <PeriodStatusBadge period={period} />
              <Icon name="chevron-right" size="sm" aria-hidden />
            </span>
          </button>
        ))
      )}
    </div>
  );
}
