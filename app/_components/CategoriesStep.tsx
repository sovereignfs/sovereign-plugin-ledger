'use client';

import { Button, CurrencyInput, Input } from '@sovereignfs/ui';
import { useState, useTransition } from 'react';
import { createCategoryWithKind } from '../actions';
import { CategoryChip } from './CategoryChip';
import styles from './SetupWizard.module.css';

const SUGGESTED_CATEGORIES: Array<{ name: string; defaultAmountMinor: number }> = [
  { name: 'Groceries', defaultAmountMinor: 15_000 },
  { name: 'Eating out', defaultAmountMinor: 15_000 },
  { name: 'Transport', defaultAmountMinor: 3_000 },
  { name: 'Household', defaultAmountMinor: 20_000 },
  { name: 'Personal', defaultAmountMinor: 10_000 },
  { name: 'Subscriptions', defaultAmountMinor: 2_000 },
];

const DEFAULT_CUSTOM_AMOUNT_MINOR = 2_000;

export function CategoriesStep({
  currencyCode,
  onBack,
  onNext,
}: {
  currencyCode: string;
  onBack: () => void;
  onNext: (categoryNames: string[]) => void;
}) {
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [customNames, setCustomNames] = useState<string[]>([]);
  const [addingCustom, setAddingCustom] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleSuggested(name: string, defaultAmountMinor: number): void {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
        setAmounts((a) => (name in a ? a : { ...a, [name]: defaultAmountMinor }));
      }
      return next;
    });
  }

  function addCustomCategory(): void {
    const name = customInput.trim();
    if (!name) return;
    setCustomNames((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setSelectedNames((prev) => new Set(prev).add(name));
    setAmounts((prev) => (name in prev ? prev : { ...prev, [name]: DEFAULT_CUSTOM_AMOUNT_MINOR }));
    setCustomInput('');
    setAddingCustom(false);
  }

  const orderedSelected = [...SUGGESTED_CATEGORIES.map((c) => c.name), ...customNames].filter(
    (name) => selectedNames.has(name),
  );

  function handleContinue(): void {
    setError(null);
    startTransition(async () => {
      for (const name of orderedSelected) {
        const result = await createCategoryWithKind({
          name,
          type: 'dynamic',
          predictedAmountMinor: amounts[name] ?? 0,
          currency: currencyCode,
        });
        if (!result.ok) {
          setError(`Couldn't add "${name}": ${result.error}`);
          return;
        }
      }
      onNext(orderedSelected);
    });
  }

  return (
    <>
      <div className={styles.progress}>
        <div className={`${styles.segment} ${styles.segmentFilled}`} />
        <div className={`${styles.segment} ${styles.segmentFilled}`} />
        <div className={`${styles.segment} ${styles.segmentFilled}`} />
      </div>
      <p className={styles.stepLabel}>Step 3 of 3</p>
      <h1 className={styles.headline}>Add your first expense categories</h1>
      <p className={styles.subtext}>
        Pick a few to start tracking against — amounts are just a starting point.
      </p>

      <div className={styles.chips}>
        {SUGGESTED_CATEGORIES.map((c) => (
          <CategoryChip
            key={c.name}
            selected={selectedNames.has(c.name)}
            onClick={() => toggleSuggested(c.name, c.defaultAmountMinor)}
          >
            {c.name}
          </CategoryChip>
        ))}
        {customNames.map((name) => (
          <CategoryChip key={name} selected onClick={() => setSelectedNames((prev) => new Set(prev).add(name))}>
            {name}
          </CategoryChip>
        ))}
        {!addingCustom && (
          <CategoryChip selected={false} dashed onClick={() => setAddingCustom(true)}>
            + Custom
          </CategoryChip>
        )}
      </div>

      {addingCustom && (
        <div className={styles.customCategoryRow}>
          <Input
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="Category name"
            aria-label="Custom category name"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustomCategory();
              }
            }}
          />
          <Button variant="secondary" onClick={addCustomCategory}>
            Add
          </Button>
        </div>
      )}

      {orderedSelected.length > 0 && (
        <div className={styles.amountsList}>
          {orderedSelected.map((name) => (
            <div key={name} className={styles.amountRow}>
              <span>{name}</span>
              <CurrencyInput
                aria-label={`Budgeted amount for ${name}`}
                valueCents={amounts[name] ?? 0}
                onValueChange={(cents) => setAmounts((prev) => ({ ...prev, [name]: cents ?? 0 }))}
              />
            </div>
          ))}
        </div>
      )}

      {error && <p className={styles.feedbackError}>{error}</p>}

      <div className={styles.actions}>
        <Button
          onClick={handleContinue}
          loading={pending}
          disabled={pending || orderedSelected.length === 0}
        >
          Continue
        </Button>
        <Button variant="ghost" className={styles.backLink} onClick={onBack} disabled={pending}>
          ← Back
        </Button>
      </div>
    </>
  );
}
