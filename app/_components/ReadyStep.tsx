'use client';

import { Button, Icon } from '@sovereignfs/ui';
import { CURRENCY_OPTIONS } from './SetupWizard';
import styles from './SetupWizard.module.css';

function formatAmountMinor(amountMinor: number, currencyCode: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(
    amountMinor / 100,
  );
}

export function ReadyStep({
  currencyCode,
  incomeAmountMinor,
  categoryNames,
  onGoToLedger,
}: {
  currencyCode: string;
  incomeAmountMinor: number | null;
  categoryNames: string[];
  onGoToLedger: () => void;
}) {
  const currencyName =
    CURRENCY_OPTIONS.find((c) => c.code === currencyCode)?.name ?? currencyCode;

  return (
    <>
      <div className={styles.readyIcon}>
        <div className={styles.readyBadge}>
          <Icon name="circle-check" size="lg" aria-hidden />
        </div>
      </div>
      <h1 className={styles.headline}>Your budget is ready</h1>
      <p className={styles.subtext}>
        Start tracking expenses right away — add accounts, saving plans, and more anytime from
        Overview.
      </p>

      <div className={styles.summaryCard}>
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Base currency</span>
          <span className={styles.summaryValue}>
            {currencyCode} — {currencyName}
          </span>
        </div>
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Primary income</span>
          <span className={styles.summaryValue}>
            {incomeAmountMinor !== null
              ? `${formatAmountMinor(incomeAmountMinor, currencyCode)} / month`
              : '—'}
          </span>
        </div>
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Categories added</span>
          <span className={styles.summaryValue}>{categoryNames.join(', ')}</span>
        </div>
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Everything else</span>
          <span className={styles.summaryValue}>Add anytime from Overview</span>
        </div>
      </div>

      <div className={styles.actions}>
        <Button onClick={onGoToLedger}>Go to Ledger</Button>
      </div>
    </>
  );
}
