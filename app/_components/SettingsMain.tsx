'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog, Icon, PageHeader } from '@sovereignfs/ui';
import { deleteCurrency, deleteIncome, setBaseCurrency } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import { formatMoney } from '../_lib/format';
import type { SettingsData } from '../_lib/settings';
import styles from './Settings.module.css';

function SectionHeader({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <div className={styles.sectionHeader}>
      <p className={styles.sectionLabel}>{label}</p>
      <button
        type="button"
        className={styles.sectionAddButton}
        onClick={onAdd}
        aria-label={`Add ${label.toLowerCase()}`}
      >
        <Icon name="plus" size="sm" aria-hidden />
      </button>
    </div>
  );
}

/** Shared by Currencies' and Incomes' rows — every delete here is guarded
 *  by a `ConfirmDialog`, matching every other delete affordance in this
 *  app (`AccountsDetail`'s own `DeleteButton`). `disabledReason` covers the
 *  two cases a delete can never succeed (the base currency, the primary
 *  income) — disabled client-side (prevention over error) rather than
 *  round-tripping to the server-side guard every time. */
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

export function SettingsMain({
  data,
  selectedCategoryId,
  onSelectCategory,
  onAddCurrency,
  onAddIncome,
  onEditIncome,
  onAddCategory,
}: {
  data: SettingsData;
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string) => void;
  onAddCurrency: () => void;
  onAddIncome: () => void;
  onEditIncome: (incomeId: string) => void;
  onAddCategory: () => void;
}) {
  const router = useRouter();

  return (
    <div className={styles.page}>
      <PageHeader title="Settings" />

      <div className={styles.section}>
        <SectionHeader label="Currencies" onAdd={onAddCurrency} />
        {data.currencies.map((c) => (
          <div key={c.id} className={styles.row}>
            <span className={styles.rowMain}>
              <span className={styles.rowName}>{c.code}</span>
              {c.isBase && <span className={styles.badge}>Base</span>}
            </span>
            <span className={styles.rowActions}>
              {!c.isBase && (
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={async () => {
                    const result = await setBaseCurrency({ currencyId: c.id });
                    if (result.ok) router.refresh();
                  }}
                >
                  Set as base
                </button>
              )}
              <DeleteIconButton
                label={c.code}
                disabledReason={c.isBase ? 'Set a different currency as base first' : undefined}
                onDelete={() => deleteCurrency({ currencyId: c.id })}
              />
            </span>
          </div>
        ))}
      </div>

      <div className={styles.section}>
        <SectionHeader label="Incomes" onAdd={onAddIncome} />
        {data.incomes.map((i) => (
          <div key={i.id} className={styles.row}>
            <span className={styles.rowMain}>
              <span className={styles.rowName}>{i.label}</span>
              <span className={styles.rowSubtitle}>{formatMoney(i.amountMinor, i.currency)}</span>
              <span className={styles.badge}>{i.kind === 'primary' ? 'Primary' : 'Secondary'}</span>
            </span>
            <span className={styles.rowActions}>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => onEditIncome(i.id)}
                title={`Edit ${i.label}`}
              >
                <Icon name="pencil" size="sm" aria-label={`Edit ${i.label}`} />
              </button>
              <DeleteIconButton
                label={i.label}
                disabledReason={i.kind === 'primary' ? 'Every budget needs a primary income' : undefined}
                onDelete={() => deleteIncome({ incomeId: i.id })}
              />
            </span>
          </div>
        ))}
      </div>

      <div className={styles.section}>
        <SectionHeader label="Categories" onAdd={onAddCategory} />
        {data.categories.length === 0 ? (
          <p className={styles.emptyState}>No categories yet.</p>
        ) : (
          data.categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={[
                styles.selectableRow,
                selectedCategoryId === c.id ? styles.rowSelected : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelectCategory(c.id)}
              aria-pressed={selectedCategoryId === c.id}
            >
              <span className={styles.rowName}>{c.name}</span>
              <span className={styles.rowSubtitle}>
                {c.kinds.length} {c.kinds.length === 1 ? 'subcategory' : 'subcategories'}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
