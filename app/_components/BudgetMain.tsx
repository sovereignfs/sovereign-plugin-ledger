import { PageHeader, Progress } from '@sovereignfs/ui';
import { formatMoney } from '../_lib/format';
import type { BudgetCategory, BudgetData } from '../_lib/budget';
import styles from './Budget.module.css';

function monthLabel(): string {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date());
}

function CategoryRow({
  category,
  selected,
  onSelect,
}: {
  category: BudgetCategory;
  selected: boolean;
  onSelect: () => void;
}) {
  const over = category.actualAmountMinor > category.predictedAmountMinor;
  const pct =
    category.predictedAmountMinor > 0
      ? (category.actualAmountMinor / category.predictedAmountMinor) * 100
      : 0;
  return (
    <button
      type="button"
      className={[styles.row, selected ? styles.rowSelected : ''].filter(Boolean).join(' ')}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <div className={styles.rowHeader}>
        <span className={styles.rowName}>{category.name}</span>
        <span className={over ? styles.rowOver : styles.rowAmounts}>
          {formatMoney(category.actualAmountMinor, category.currency)} /{' '}
          {formatMoney(category.predictedAmountMinor, category.currency)}
          {over && ' · over'}
        </span>
      </div>
      <Progress value={pct} label={`${category.name} budget used`} />
    </button>
  );
}

/**
 * List column — Dynamic/Fixed sections only (Saving added at L.12; a
 * saving-type category can't exist yet, `listCategoriesWithKinds` already
 * filters it out defensively). No "view N more" truncation, unlike
 * web-shell.md's wireframe — that pattern was illustrating a much larger
 * demo dataset than a real single-user budget reaches; showing every
 * category directly is simpler and correct at this scale.
 */
export function BudgetMain({
  data,
  selectedId,
  onSelect,
}: {
  data: BudgetData;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className={styles.page}>
      <PageHeader title="Budget" description={monthLabel()} />

      <section className={styles.section}>
        <p className={styles.sectionLabel}>Dynamic</p>
        {data.dynamic.length === 0 ? (
          <p className={styles.emptyState}>No dynamic categories yet.</p>
        ) : (
          data.dynamic.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              selected={category.id === selectedId}
              onSelect={() => onSelect(category.id)}
            />
          ))
        )}
      </section>

      <section className={styles.section}>
        <p className={styles.sectionLabel}>Fixed</p>
        {data.fixed.length === 0 ? (
          <p className={styles.emptyState}>No fixed expenses yet.</p>
        ) : (
          data.fixed.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              selected={category.id === selectedId}
              onSelect={() => onSelect(category.id)}
            />
          ))
        )}
      </section>
    </div>
  );
}
