'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ConfirmDialog } from '@sovereignfs/ui';
import { deleteCategory } from '../actions';
import type { BudgetKind, BudgetSavingCategory } from '../_lib/budget';
import { useFormatters } from '../_lib/locale';
import { JarTransactionDialog } from './JarTransactionDialog';
import styles from './Budget.module.css';

/**
 * web-shell.md screen 3's Saving detail — "target + jar balance instead of
 * a budget bar," mirroring `CategoryDetail`'s own shape (header + stat
 * block + recent history + actions) but for a running-balance jar rather
 * than a spend-against-budget category. A jar's monthly target is its
 * saving kind's `predictedAmountMinor`, so "Edit target" reuses
 * `EditBudgetDialog` via `onEditTarget`; deleting the jar deletes its
 * saving category (kind, jar, and history cascade).
 */
export function SavingJarDetail({
  category,
  onEditTarget,
  onDeleted,
}: {
  category: BudgetSavingCategory;
  onEditTarget: (kind: BudgetKind) => void;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const fmt = useFormatters();
  const [transacting, setTransacting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | undefined>();

  return (
    <div>
      <div className={styles.detailHeader}>
        <h2 className={styles.detailTitle}>{category.name}</h2>
        <p className={styles.detailSubtitle}>
          Monthly target {fmt.money(category.targetAmountMinor, category.currency)}
        </p>
      </div>

      <div className={styles.detailBody}>
        <div className={styles.jarStatGrid}>
          <div>
            <p className={styles.statLabel}>Balance</p>
            <p className={styles.statValue}>
              {fmt.money(category.jarBalanceMinor, category.currency)}
            </p>
          </div>
          <div>
            <p className={styles.statLabel}>Monthly target</p>
            <p className={styles.statValue}>
              {fmt.money(category.targetAmountMinor, category.currency)}
            </p>
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
                  <span className={styles.transactionDate}>{fmt.day(tx.occurredAt)}</span>
                  {tx.note && ` • ${tx.note}`}
                </span>
                <span className={styles.transactionAmount}>
                  {tx.amountMinor > 0 ? '+' : ''}
                  {fmt.money(tx.amountMinor, category.currency)}
                </span>
              </div>
            ))
          )}
        </section>

        <div className={styles.actions}>
          <Button onClick={() => setTransacting(true)}>Add money / withdraw</Button>
          <Button
            variant="secondary"
            onClick={() =>
              onEditTarget({
                id: category.kindId,
                name: category.name,
                predictedAmountMinor: category.targetAmountMinor,
                actualAmountMinor: 0,
                currency: category.currency,
              })
            }
          >
            Edit target
          </Button>
          <Button variant="destructive" onClick={() => setConfirmingDelete(true)}>
            Delete jar
          </Button>
        </div>
      </div>

      {transacting && (
        <JarTransactionDialog
          jarId={category.jarId}
          jarName={category.name}
          currency={category.currency}
          onClose={() => setTransacting(false)}
        />
      )}
      <ConfirmDialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title={`Delete ${category.name}?`}
        message={`This removes the jar, its ${fmt.money(category.jarBalanceMinor, category.currency)} balance, and its whole history — can't be undone.`}
        destructive
        pending={deletePending}
        error={deleteError}
        confirmLabel={deletePending ? 'Deleting…' : 'Delete jar'}
        onConfirm={async () => {
          setDeletePending(true);
          const result = await deleteCategory({ categoryId: category.id });
          setDeletePending(false);
          if (!result.ok) {
            setDeleteError(result.error);
            return;
          }
          setConfirmingDelete(false);
          onDeleted();
          router.refresh();
        }}
      />
    </div>
  );
}
