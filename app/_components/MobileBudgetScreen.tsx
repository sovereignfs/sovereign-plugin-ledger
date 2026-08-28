'use client';

import { Icon } from '@sovereignfs/ui';
import { formatMoney } from '../_lib/format';
import type { BudgetCategory, BudgetData, BudgetKind, BudgetSavingCategory } from '../_lib/budget';
import { CategoryDetail } from './CategoryDetail';
import { MobileSettingsLink } from './MobileSettingsLink';
import { SavingJarDetail } from './SavingJarDetail';
import styles from './Mobile.module.css';

function monthLabel(): string {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date());
}

function CategoryRow({ category, onSelect }: { category: BudgetCategory; onSelect: () => void }) {
  const over = category.actualAmountMinor > category.predictedAmountMinor;
  return (
    <button type="button" className={styles.row} onClick={onSelect}>
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>{category.name}</span>
      </span>
      <span className={styles.rowValue}>
        <span style={over ? { color: 'var(--sv-color-error-text)' } : undefined}>
          {formatMoney(category.actualAmountMinor, category.currency)} /{' '}
          {formatMoney(category.predictedAmountMinor, category.currency)}
        </span>
        <Icon name="chevron-right" size="sm" aria-hidden />
      </span>
    </button>
  );
}

/**
 * mobile-fork.md screens 2-3 — a full-width replacement screen, not a route
 * change: `selected` is the same client `useState` `BudgetView` already
 * holds for the desktop detail column, just rendering a different
 * presentation of it. The detail screen reuses `CategoryDetail` verbatim
 * (its own CSS has no desktop-only width assumption to fight) behind a
 * hand-rolled `‹ Budget` header — no shared back-header component exists
 * yet (mobile-fork.md's own open question), matching `example-layouts`'
 * `MobileStackedDemo.tsx` reference exactly.
 */
function SavingRow({ category, onSelect }: { category: BudgetSavingCategory; onSelect: () => void }) {
  return (
    <button type="button" className={styles.row} onClick={onSelect}>
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>{category.name}</span>
        <span className={styles.rowSubtitle}>
          Target {formatMoney(category.targetAmountMinor, category.currency)}
        </span>
      </span>
      <span className={styles.rowValue}>
        {formatMoney(category.jarBalanceMinor, category.currency)}
        <Icon name="chevron-right" size="sm" aria-hidden />
      </span>
    </button>
  );
}

export function MobileBudgetScreen({
  data,
  selected,
  selectedSaving,
  onSelect,
  onBack,
  onEditBudget,
  onAddSavingJar,
}: {
  data: BudgetData;
  selected: BudgetCategory | null;
  selectedSaving: BudgetSavingCategory | null;
  onSelect: (id: string) => void;
  onBack: () => void;
  onEditBudget: (kind: BudgetKind) => void;
  onAddSavingJar: () => void;
}) {
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
          <CategoryDetail category={selected} onEditBudget={onEditBudget} />
        ) : (
          selectedSaving && <SavingJarDetail category={selectedSaving} />
        )}
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.titleRow}>
        <div>
          <h1 className={styles.title}>Budget</h1>
          <p className={styles.subtitle}>{monthLabel()}</p>
        </div>
        <MobileSettingsLink />
      </div>

      <section>
        <p className={styles.cardTitle}>Dynamic</p>
        {data.dynamic.length === 0 ? (
          <p className={styles.emptyState}>No dynamic categories yet.</p>
        ) : (
          data.dynamic.map((category) => (
            <CategoryRow key={category.id} category={category} onSelect={() => onSelect(category.id)} />
          ))
        )}
      </section>

      <section>
        <p className={styles.cardTitle}>Fixed</p>
        {data.fixed.length === 0 ? (
          <p className={styles.emptyState}>No fixed expenses yet.</p>
        ) : (
          data.fixed.map((category) => (
            <CategoryRow key={category.id} category={category} onSelect={() => onSelect(category.id)} />
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
            <SavingRow key={category.id} category={category} onSelect={() => onSelect(category.id)} />
          ))
        )}
      </section>
    </div>
  );
}
