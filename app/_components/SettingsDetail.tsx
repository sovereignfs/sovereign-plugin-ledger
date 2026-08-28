'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ConfirmDialog, Icon } from '@sovereignfs/ui';
import { deleteCategory, deleteKind } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import { formatMoney } from '../_lib/format';
import type { SettingsData } from '../_lib/settings';
import styles from './Settings.module.css';

/** Same shared shape as `SettingsMain`'s own `DeleteIconButton` — kept as a
 *  separate, file-local copy rather than a shared import, matching
 *  `AccountsDetail`'s own precedent of a small file-scoped delete helper
 *  rather than a cross-file abstraction for a ~20-line component. */
function DeleteIconButton({
  label,
  disabledReason,
  onDelete,
}: {
  label: string;
  disabledReason?: string;
  onDelete: () => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  return (
    <>
      <button
        type="button"
        className={styles.iconButton}
        disabled={!!disabledReason}
        title={disabledReason ?? `Delete ${label}`}
        onClick={() => setConfirming(true)}
      >
        <Icon name="trash-2" size="sm" aria-label={`Delete ${label}`} />
      </button>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Delete ${label}?`}
        message={`This removes "${label}" and can't be undone.`}
        destructive
        pending={pending}
        error={error}
        confirmLabel={pending ? 'Deleting…' : 'Delete'}
        onConfirm={async () => {
          setPending(true);
          const result = await onDelete();
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

function DeleteCategoryButton({
  categoryId,
  label,
  disabledReason,
  onDeleted,
}: {
  categoryId: string;
  label: string;
  disabledReason?: string;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  return (
    <>
      <Button variant="destructive" onClick={() => setConfirming(true)} disabled={!!disabledReason}>
        Delete category
      </Button>
      {disabledReason && <p className={styles.rowSubtitle}>{disabledReason}</p>}
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Delete ${label}?`}
        message={`This removes "${label}" and every subcategory under it — can't be undone.`}
        destructive
        pending={pending}
        error={error}
        confirmLabel={pending ? 'Deleting…' : 'Delete'}
        onConfirm={async () => {
          setPending(true);
          const result = await deleteCategory({ categoryId });
          setPending(false);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          onDeleted();
        }}
      />
    </>
  );
}

/**
 * Categories' own detail column — the one Settings section with real
 * nested structure (a category owns a list of kinds), unlike Currencies/
 * Incomes' flat inline rows. Kind budgeted amounts stay read-only here;
 * `EditBudgetDialog` (Budget page) is the one place that mutates them.
 */
export function SettingsDetail({
  data,
  categoryId,
  onDeselect,
  onAddKind,
}: {
  data: SettingsData;
  categoryId: string;
  onDeselect: () => void;
  onAddKind: (categoryId: string, categoryCurrency: string) => void;
}) {
  const router = useRouter();
  const category = data.categories.find((c) => c.id === categoryId);
  if (!category) return null;

  const linkedKindNames = category.kinds
    .filter((k) => data.loanLinkedKindIds.has(k.id))
    .map((k) => k.name);

  return (
    <div>
      <div className={styles.detailHeader}>
        <h2 className={styles.detailTitle}>{category.name}</h2>
        <p className={styles.detailSubtitle}>
          {category.type === 'dynamic' ? 'Dynamic' : 'Fixed'} category
        </p>
      </div>
      <div className={styles.detailBody}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionLabel}>Subcategories</p>
          <button
            type="button"
            className={styles.sectionAddButton}
            onClick={() => onAddKind(category.id, category.kinds[0]?.currency ?? 'EUR')}
            aria-label="Add subcategory"
          >
            <Icon name="plus" size="sm" aria-hidden />
          </button>
        </div>
        {category.kinds.length === 0 ? (
          <p className={styles.emptyState}>No subcategories yet.</p>
        ) : (
          category.kinds.map((kind) => (
            <div key={kind.id} className={styles.row}>
              <span className={styles.rowMain}>
                <span className={styles.rowName}>{kind.name}</span>
                <span className={styles.rowSubtitle}>
                  {formatMoney(kind.predictedAmountMinor, kind.currency)}
                </span>
              </span>
              <DeleteIconButton
                label={kind.name}
                disabledReason={
                  data.loanLinkedKindIds.has(kind.id)
                    ? 'A loan is linked to this — delete the loan from Accounts first'
                    : undefined
                }
                onDelete={() => deleteKind({ kindId: kind.id })}
              />
            </div>
          ))
        )}
        <p className={styles.linkedNote}>
          <Link href="/ledger/budget">Adjust budgeted amounts from Budget →</Link>
        </p>

        <DeleteCategoryButton
          categoryId={category.id}
          label={category.name}
          disabledReason={
            linkedKindNames.length > 0
              ? `A loan is linked to "${linkedKindNames[0]}" — delete the loan from Accounts first`
              : undefined
          }
          onDeleted={() => {
            router.refresh();
            onDeselect();
          }}
        />
      </div>
    </div>
  );
}
