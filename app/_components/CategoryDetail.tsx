'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog, Icon, Progress } from '@sovereignfs/ui';
import { deleteTransaction } from '../actions';
import type { BudgetCategory, BudgetKind, BudgetTransaction } from '../_lib/budget';
import { useFormatters } from '../_lib/locale';
import styles from './Budget.module.css';

/** Trash icon + confirm for one logged expense — a typo shouldn't be permanent. */
function DeleteTransactionButton({ transaction }: { transaction: BudgetTransaction }) {
  const router = useRouter();
  const fmt = useFormatters();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  return (
    <>
      <button
        type="button"
        className={styles.iconButton}
        title="Delete expense"
        onClick={() => setConfirming(true)}
      >
        <Icon name="trash-2" size="sm" aria-label="Delete expense" />
      </button>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete this expense?"
        message={`This removes the ${fmt.money(transaction.amountMinor, transaction.currency)} ${transaction.kindName} expense from ${fmt.day(transaction.occurredAt)} and can't be undone.`}
        destructive
        pending={pending}
        error={error}
        confirmLabel={pending ? 'Deleting…' : 'Delete'}
        onConfirm={async () => {
          setPending(true);
          const result = await deleteTransaction({ transactionId: transaction.id });
          setPending(false);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.refresh();
          setConfirming(false);
        }}
      />
    </>
  );
}

/**
 * web-shell.md screen 3's detail column — subcategory breakdown + recent
 * transactions, both already part of `getBudgetData`'s payload (no
 * on-selection fetch, see budget.ts's own doc comment). Every subcategory
 * row carries its own "edit budget" affordance — a category can have
 * several since Settings' "Add subcategory" (L.14), so a single button
 * editing `kinds[0]` would leave the rest uneditable. Each recent
 * transaction can be edited or deleted in place.
 */
export function CategoryDetail({
  category,
  onEditBudget,
  onEditTransaction,
}: {
  category: BudgetCategory;
  onEditBudget: (kind: BudgetKind) => void;
  onEditTransaction: (transaction: BudgetTransaction) => void;
}) {
  const fmt = useFormatters();

  return (
    <div>
      <div className={styles.detailHeader}>
        <h2 className={styles.detailTitle}>{category.name}</h2>
        <p className={styles.detailSubtitle}>
          Budgeted {fmt.money(category.predictedAmountMinor, category.currency)} • Spent{' '}
          {fmt.money(category.actualAmountMinor, category.currency)}
        </p>
      </div>

      <div className={styles.detailBody}>
        <section>
          <p className={styles.detailSectionLabel}>By subcategory</p>
          {category.kinds.map((kind) => {
            const pct =
              kind.predictedAmountMinor > 0
                ? (kind.actualAmountMinor / kind.predictedAmountMinor) * 100
                : 0;
            return (
              <div key={kind.id} className={styles.kindRow}>
                <div className={styles.kindRowHeader}>
                  <span>{kind.name}</span>
                  <span className={styles.kindRowActions}>
                    <span className={styles.transactionAmount}>
                      {fmt.money(kind.actualAmountMinor, kind.currency)} /{' '}
                      {fmt.money(kind.predictedAmountMinor, kind.currency)}
                    </span>
                    <button
                      type="button"
                      className={styles.iconButton}
                      title={`Edit budgeted amount for ${kind.name}`}
                      onClick={() => onEditBudget(kind)}
                    >
                      <Icon
                        name="pencil"
                        size="sm"
                        aria-label={`Edit budgeted amount for ${kind.name}`}
                      />
                    </button>
                  </span>
                </div>
                <Progress value={pct} label={`${kind.name} budget used`} />
              </div>
            );
          })}
        </section>

        <section>
          <p className={styles.detailSectionLabel}>Recent in this category</p>
          {category.recentTransactions.length === 0 ? (
            <p className={styles.emptyState}>No expenses logged yet.</p>
          ) : (
            category.recentTransactions.map((tx) => (
              <div key={tx.id} className={styles.transactionRow}>
                <span className={styles.transactionLabel}>
                  <span className={styles.transactionDate}>{fmt.day(tx.occurredAt)}</span> •{' '}
                  {tx.kindName}
                  {tx.note && <span className={styles.transactionDate}> · {tx.note}</span>}
                </span>
                <span className={styles.kindRowActions}>
                  <span className={styles.transactionAmount}>
                    -{fmt.money(tx.amountMinor, tx.currency)}
                  </span>
                  <button
                    type="button"
                    className={styles.iconButton}
                    title="Edit expense"
                    onClick={() => onEditTransaction(tx)}
                  >
                    <Icon name="pencil" size="sm" aria-label="Edit expense" />
                  </button>
                  <DeleteTransactionButton transaction={tx} />
                </span>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
