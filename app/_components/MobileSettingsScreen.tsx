'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog, Icon } from '@sovereignfs/ui';
import { deleteCurrency, deleteIncome, setBaseCurrency } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import { formatMoney } from '../_lib/format';
import type { SettingsData } from '../_lib/settings';
import styles from './Mobile.module.css';
import { SettingsDetail } from './SettingsDetail';

/** Same `ConfirmDialog`-backed delete affordance as desktop's `SettingsMain`
 *  — a separate, file-local copy rather than a shared import, matching
 *  every other desktop/mobile component pair in this app (e.g.
 *  `AccountsDetail` vs `MobileAccountsScreen`, which duplicate nothing
 *  shared beyond the detail component itself). */
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
        className={styles.link}
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

/**
 * Mobile fork of Settings — same shape as `MobileAccountsScreen`: Currencies/
 * Incomes are flat rows with inline actions (no drill-down target), while
 * Categories promotes to the shared `SettingsDetail` (already a plain
 * content block, reused verbatim) behind a hand-rolled back header.
 */
export function MobileSettingsScreen({
  data,
  selectedCategoryId,
  onSelectCategory,
  onBack,
  onAddCurrency,
  onAddIncome,
  onEditIncome,
  onAddCategory,
  onAddKind,
}: {
  data: SettingsData;
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string) => void;
  onBack: () => void;
  onAddCurrency: () => void;
  onAddIncome: () => void;
  onEditIncome: (incomeId: string) => void;
  onAddCategory: () => void;
  onAddKind: (categoryId: string, currency: string) => void;
}) {
  if (selectedCategoryId) {
    return (
      <div className={styles.screen}>
        <div className={styles.backHeader}>
          <button type="button" className={styles.backButton} onClick={onBack}>
            <Icon name="chevron-left" size="sm" aria-hidden />
            Settings
          </button>
        </div>
        <SettingsDetail
          key={selectedCategoryId}
          data={data}
          categoryId={selectedCategoryId}
          onDeselect={onBack}
          onAddKind={onAddKind}
        />
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>Settings</h1>

      <section>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionTitle}>Currencies</p>
          <button
            type="button"
            className={styles.sectionAddButton}
            onClick={onAddCurrency}
            aria-label="Add currency"
          >
            <Icon name="plus" size="sm" aria-hidden />
          </button>
        </div>
        {data.currencies.map((c) => (
          <div key={c.id} className={styles.row}>
            <span className={styles.rowText}>
              <span className={styles.rowTitle}>
                {c.code}
                {c.isBase && ' · Base'}
              </span>
            </span>
            <span className={styles.rowValue}>
              {!c.isBase && (
                <button
                  type="button"
                  className={styles.link}
                  onClick={async () => {
                    await setBaseCurrency({ currencyId: c.id });
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
      </section>

      <section>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionTitle}>Incomes</p>
          <button
            type="button"
            className={styles.sectionAddButton}
            onClick={onAddIncome}
            aria-label="Add income"
          >
            <Icon name="plus" size="sm" aria-hidden />
          </button>
        </div>
        {data.incomes.map((i) => (
          <div key={i.id} className={styles.row}>
            <span className={styles.rowText}>
              <span className={styles.rowTitle}>{i.label}</span>
              <span className={styles.rowSubtitle}>
                {formatMoney(i.amountMinor, i.currency)} ·{' '}
                {i.kind === 'primary' ? 'Primary' : 'Secondary'}
              </span>
            </span>
            <span className={styles.rowValue}>
              <button
                type="button"
                className={styles.link}
                onClick={() => onEditIncome(i.id)}
                title={`Edit ${i.label}`}
              >
                <Icon name="pencil" size="sm" aria-label={`Edit ${i.label}`} />
              </button>
              <DeleteIconButton
                label={i.label}
                disabledReason={
                  i.kind === 'primary' ? 'Every budget needs a primary income' : undefined
                }
                onDelete={() => deleteIncome({ incomeId: i.id })}
              />
            </span>
          </div>
        ))}
      </section>

      <section>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionTitle}>Categories</p>
          <button
            type="button"
            className={styles.sectionAddButton}
            onClick={onAddCategory}
            aria-label="Add category"
          >
            <Icon name="plus" size="sm" aria-hidden />
          </button>
        </div>
        {data.categories.length === 0 ? (
          <p className={styles.emptyState}>No categories yet.</p>
        ) : (
          data.categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={styles.row}
              onClick={() => onSelectCategory(c.id)}
            >
              <span className={styles.rowTitle}>{c.name}</span>
              <span className={styles.rowValue}>
                {c.kinds.length} {c.kinds.length === 1 ? 'subcategory' : 'subcategories'}
                <Icon name="chevron-right" size="sm" aria-hidden />
              </span>
            </button>
          ))
        )}
      </section>
    </div>
  );
}
