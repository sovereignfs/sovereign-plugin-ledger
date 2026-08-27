import { Button, Progress } from '@sovereignfs/ui';
import { formatMoney } from '../_lib/format';
import type { BudgetCategory, BudgetKind } from '../_lib/budget';
import styles from './Budget.module.css';

/**
 * web-shell.md screen 3's detail column — subcategory breakdown + recent
 * transactions, both already part of `getBudgetData`'s payload (no
 * on-selection fetch, see budget.ts's own doc comment). "Edit budgeted
 * amount" edits `category.kinds[0]` — every category created through the
 * current UI (`createCategoryWithKind`, the only path that exists) has
 * exactly one kind, so this is unambiguous today; a category with more than
 * one kind isn't reachable from any shipped screen yet (`createKind` exists
 * as an action but nothing calls it outside the wizard's own combo action).
 */
export function CategoryDetail({
  category,
  onEditBudget,
}: {
  category: BudgetCategory;
  onEditBudget: (kind: BudgetKind) => void;
}) {
  const firstKind = category.kinds[0];

  return (
    <div>
      <div className={styles.detailHeader}>
        <h2 className={styles.detailTitle}>{category.name}</h2>
        <p className={styles.detailSubtitle}>
          Budgeted {formatMoney(category.predictedAmountMinor, category.currency)} • Spent{' '}
          {formatMoney(category.actualAmountMinor, category.currency)}
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
                  <span className={styles.transactionAmount}>
                    {formatMoney(kind.actualAmountMinor, kind.currency)} /{' '}
                    {formatMoney(kind.predictedAmountMinor, kind.currency)}
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
                  <span className={styles.transactionDate}>
                    {new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
                      new Date(tx.occurredAt),
                    )}
                  </span>{' '}
                  • {tx.kindName}
                </span>
                <span className={styles.transactionAmount}>
                  -{formatMoney(tx.amountMinor, tx.currency)}
                </span>
              </div>
            ))
          )}
        </section>

        {firstKind && (
          <Button variant="secondary" onClick={() => onEditBudget(firstKind)}>
            Edit budgeted amount
          </Button>
        )}
      </div>
    </div>
  );
}
