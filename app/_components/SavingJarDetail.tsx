'use client';

import { useState } from 'react';
import { Button } from '@sovereignfs/ui';
import { formatMoney } from '../_lib/format';
import type { BudgetSavingCategory } from '../_lib/budget';
import { JarTransactionDialog } from './JarTransactionDialog';
import styles from './Budget.module.css';

/**
 * web-shell.md screen 3's Saving detail — "target + jar balance instead of
 * a budget bar," mirroring `CategoryDetail`'s own shape (header + stat
 * block + recent history + a primary action) but for a running-balance jar
 * rather than a spend-against-budget category, so it's a distinct
 * component rather than a branch inside `CategoryDetail` (whose props type
 * doesn't fit a `BudgetSavingCategory` at all).
 */
export function SavingJarDetail({ category }: { category: BudgetSavingCategory }) {
  const [transacting, setTransacting] = useState(false);

  return (
    <div>
      <div className={styles.detailHeader}>
        <h2 className={styles.detailTitle}>{category.name}</h2>
        <p className={styles.detailSubtitle}>Monthly target {formatMoney(category.targetAmountMinor, category.currency)}</p>
      </div>

      <div className={styles.detailBody}>
        <div className={styles.jarStatGrid}>
          <div>
            <p className={styles.statLabel}>Balance</p>
            <p className={styles.statValue}>{formatMoney(category.jarBalanceMinor, category.currency)}</p>
          </div>
          <div>
            <p className={styles.statLabel}>Monthly target</p>
            <p className={styles.statValue}>{formatMoney(category.targetAmountMinor, category.currency)}</p>
          </div>
        </div>

        <section>
          <p className={styles.detailSectionLabel}>Recent activity</p>
          {category.recentJarTransactions.length === 0 ? (
            <p className={styles.emptyState}>No contributions or withdrawals yet.</p>
          ) : (
            category.recentJarTransactions.map((tx) => (
              <div key={tx.id} className={styles.transactionRow}>
                <span className={styles.transactionLabel}>
                  <span className={styles.transactionDate}>
                    {new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
                      new Date(tx.occurredAt),
                    )}
                  </span>
                  {tx.note && ` • ${tx.note}`}
                </span>
                <span className={styles.transactionAmount}>
                  {tx.amountMinor > 0 ? '+' : ''}
                  {formatMoney(tx.amountMinor, category.currency)}
                </span>
              </div>
            ))
          )}
        </section>

        <Button variant="secondary" onClick={() => setTransacting(true)}>
          Add money / withdraw
        </Button>
      </div>

      {transacting && (
        <JarTransactionDialog
          jarId={category.jarId}
          jarName={category.name}
          currency={category.currency}
          onClose={() => setTransacting(false)}
        />
      )}
    </div>
  );
}
