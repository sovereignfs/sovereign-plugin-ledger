'use client';

import { Icon } from '@sovereignfs/ui';
import type {
  BudgetCategory,
  BudgetData,
  BudgetKind,
  BudgetSavingCategory,
  BudgetTransaction,
} from '../_lib/budget';
import { useFormatters } from '../_lib/locale';
import { CategoryDetail } from './CategoryDetail';
import { MobileSettingsLink } from './MobileSettingsLink';
import { SavingJarDetail } from './SavingJarDetail';
import styles from './Mobile.module.css';

function CategoryRow({ category, onSelect }: { category: BudgetCategory; onSelect: () => void }) {
  const fmt = useFormatters();
  const over = category.actualAmountMinor > category.predictedAmountMinor;
  return (
    <button type="button" className={styles.row} onClick={onSelect}>
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>{category.name}</span>
      </span>
      <span className={styles.rowValue}>
        <span className={over ? styles.rowValueOver : undefined}>
          {fmt.money(category.actualAmountMinor, category.currency)} /{' '}
          {fmt.money(category.predictedAmountMinor, category.currency)}
        </span>
        <Icon name="chevron-right" size="sm" aria-hidden />
      </span>
    </button>
  );
}

function SavingRow({
  category,
  onSelect,
}: {
  category: BudgetSavingCategory;
  onSelect: () => void;
}) {
  const fmt = useFormatters();
  return (
    <button type="button" className={styles.row} onClick={onSelect}>
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>{category.name}</span>
        <span className={styles.rowSubtitle}>
          Target {fmt.money(category.targetAmountMinor, category.currency)}
        </span>
      </span>
      <span className={styles.rowValue}>
        {fmt.money(category.jarBalanceMinor, category.currency)}
        <Icon name="chevron-right" size="sm" aria-hidden />
      </span>
    </button>
  );
}

/**
 * mobile-fork.md screens 2-3 — a full-width replacement screen, not a route
 * change: `selected` is the same client `useState` `BudgetView` already
 * holds for the desktop detail column, just rendering a different
 * presentation of it. The detail screen reuses `CategoryDetail` /
 * `SavingJarDetail` verbatim behind a hand-rolled `‹ Budget` header — no
 * shared back-header component exists yet (mobile-fork.md's own open
 * question), matching `example-layouts`' `MobileStackedDemo.tsx`.
 */
export function MobileBudgetScreen({
  data,
  selected,
  selectedSaving,
  onSelect,
  onBack,
  onEditBudget,
  onEditTransaction,
  onAddSavingJar,
}: {
  data: BudgetData;
  selected: BudgetCategory | null;
  selectedSaving: BudgetSavingCategory | null;
  onSelect: (id: string) => void;
  onBack: () => void;
  onEditBudget: (kind: BudgetKind) => void;
  onEditTransaction: (transaction: BudgetTransaction) => void;
  onAddSavingJar: () => void;
}) {
  const fmt = useFormatters();

  if (selected || selectedSaving) {
    return (
      <div className={styles.screen}>
        <div className={styles.backHeader}>
          <button type="button" className={styles.backButton} onClick={onBack}>
            <Icon name="chevron-left" size="sm" aria-hidden />
            Budget
          </button>
        </div>
        {selected ? (
          <CategoryDetail
            category={selected}
            onEditBudget={onEditBudget}
            onEditTransaction={onEditTransaction}
          />
        ) : (
          selectedSaving && (
            <SavingJarDetail
              category={selectedSaving}
              onEditTarget={onEditBudget}
              onDeleted={onBack}
            />
          )
        )}
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.titleRow}>
        <div>
          <h1 className={styles.title}>Budget</h1>
          <p className={styles.subtitle}>{fmt.period(data.period.year, data.period.month)}</p>
        </div>
        <MobileSettingsLink />
      </div>

      <section>
        <p className={styles.cardTitle}>Dynamic</p>
        {data.dynamic.length === 0 ? (
          <p className={styles.emptyState}>No dynamic categories yet.</p>
        ) : (
          data.dynamic.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              onSelect={() => onSelect(category.id)}
            />
          ))
        )}
      </section>

      <section>
        <p className={styles.cardTitle}>Fixed</p>
        {data.fixed.length === 0 ? (
          <p className={styles.emptyState}>No fixed expenses yet.</p>
        ) : (
          data.fixed.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              onSelect={() => onSelect(category.id)}
            />
          ))
        )}
      </section>

      <section>
        <div className={styles.sectionHeader}>
          <p className={styles.cardTitle}>Saving</p>
          <button
            type="button"
            className={styles.sectionAddButton}
            onClick={onAddSavingJar}
            aria-label="Add saving jar"
          >
            <Icon name="plus" size="sm" aria-hidden />
          </button>
        </div>
        {data.saving.length === 0 ? (
          <p className={styles.emptyState}>No saving jars yet.</p>
        ) : (
          data.saving.map((category) => (
            <SavingRow
              key={category.id}
              category={category}
              onSelect={() => onSelect(category.id)}
            />
          ))
        )}
      </section>
    </div>
  );
}
