'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useState, type FormEvent } from 'react';
import {
  Button,
  DatePicker,
  Dialog,
  EmptyState,
  FormField,
  Input,
  Select,
  Spinner,
} from '@sovereignfs/ui';
import { MoneyInput } from './MoneyInput';
import { getExpenseFormOptions, updateTransaction } from '../actions';
import type { ExpenseFormCategoryOption } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import type { BudgetTransaction } from '../_lib/budget';
import { fromOccurredAt } from '../_lib/format';
import { useFormatters } from '../_lib/locale';
import { getUtcYearMonth, isCurrentMonth, utcNoonOf } from '../_lib/period';
import styles from './AddExpenseDialog.module.css';

/**
 * Edit a logged expense — amount, subcategory, date, note. Mirrors
 * `AddExpenseDialog`'s form (same lazily-fetched category/kind options, same
 * UTC-noon date convention, same pinned footer and disabled-with-a-reason
 * submit) minus the fund-from-jar toggle: a jar-funded expense is a jar
 * withdrawal row, edited from the jar itself, never a `ledger_transactions`
 * row.
 *
 * Unlike `AddExpenseDialog` this is mounted only while it is open — the
 * caller renders it conditionally — so it needs no remount key to clear
 * state between openings.
 */
export function EditTransactionDialog({
  transaction,
  onClose,
}: {
  transaction: BudgetTransaction;
  onClose: () => void;
}) {
  const router = useRouter();
  const formatters = useFormatters();
  const formId = useId();

  const [categories, setCategories] = useState<ExpenseFormCategoryOption[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [kindId, setKindId] = useState(transaction.kindId);
  const [categoryId, setCategoryId] = useState('');
  const [amountCents, setAmountCents] = useState<number | null>(transaction.amountMinor);
  const [date, setDate] = useState<Date>(() => fromOccurredAt(transaction.occurredAt));
  const [note, setNote] = useState(transaction.note ?? '');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    getExpenseFormOptions()
      .then((options) => {
        if (cancelled) return;
        setCategories(options.categories);
        const owner = options.categories.find((c) =>
          c.kinds.some((k) => k.id === transaction.kindId),
        );
        setCategoryId(owner?.id ?? options.categories[0]?.id ?? '');
      })
      .catch(() => {
        // Same gap as the add dialog had: a rejected server action otherwise
        // left this sitting on its spinner with no way back.
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [transaction.kindId, reloadKey]);

  const selectedCategory = categories?.find((c) => c.id === categoryId) ?? null;
  const selectedKind = selectedCategory?.kinds.find((k) => k.id === kindId) ?? null;

  const occurredAt = utcNoonOf(date);
  const { year: occurredYear, month: occurredMonth } = getUtcYearMonth(occurredAt);
  const landsInAnotherMonth = !isCurrentMonth(occurredYear, occurredMonth);

  const blockedReason = ((): string | null => {
    if (!selectedKind) {
      return selectedCategory
        ? `${selectedCategory.name} has no subcategories yet — add one in Settings.`
        : 'Choose a subcategory for this expense.';
    }
    if (amountCents === null || amountCents <= 0) return 'Enter an amount greater than zero.';
    return null;
  })();

  const canSubmit = blockedReason === null && !pending;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setResult(null);
    try {
      const outcome = await updateTransaction({
        transactionId: transaction.id,
        kindId: selectedKind?.id ?? transaction.kindId,
        amountMinor: amountCents ?? 0,
        occurredAt,
        note: note.trim(),
      });
      if (outcome.ok) {
        router.refresh();
        onClose();
        return;
      }
      setResult(outcome);
    } finally {
      setPending(false);
    }
  }

  const actions = (
    <div className={styles.footer}>
      <p className={styles.feedback} role="status" aria-live="polite">
        {result && !result.ok ? (
          <span className={styles.feedbackError}>{result.error}</span>
        ) : (
          blockedReason
        )}
      </p>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" form={formId} loading={pending} disabled={!canSubmit}>
          Save
        </Button>
      </div>
    </div>
  );

  if (loadFailed) {
    return (
      <Dialog open onClose={onClose} size="md" header="Edit expense" aria-label="Edit expense">
        <EmptyState
          icon="alert-triangle"
          heading="Couldn't load your categories"
          description="Something went wrong reaching your budget."
          action={<Button onClick={() => setReloadKey((n) => n + 1)}>Try again</Button>}
        />
      </Dialog>
    );
  }

  if (categories === null) {
    return (
      <Dialog open onClose={onClose} size="md" header="Edit expense" aria-label="Edit expense">
        <div className={styles.loading}>
          <Spinner label="Loading categories…" />
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      header="Edit expense"
      aria-label="Edit expense"
      footer={actions}
    >
      <form id={formId} className={styles.body} onSubmit={handleSubmit}>
        <FormField label={`Amount (${selectedKind?.currency ?? transaction.currency})`}>
          {(field) => (
            <MoneyInput
              currency={selectedKind?.currency ?? transaction.currency}
              {...field}
              valueCents={amountCents}
              onValueChange={setAmountCents}
            />
          )}
        </FormField>
        <div className={styles.row}>
          <FormField label="Category">
            {(field) => (
              <Select
                {...field}
                value={categoryId}
                onChange={(e) => {
                  const next = categories.find((c) => c.id === e.target.value);
                  setCategoryId(e.target.value);
                  setKindId(next?.kinds[0]?.id ?? '');
                }}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Subcategory">
            {(field) => (
              <Select {...field} value={kindId} onChange={(e) => setKindId(e.target.value)}>
                {selectedCategory?.kinds.map((kind) => (
                  <option key={kind.id} value={kind.id}>
                    {kind.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        </div>
        <FormField
          label="Date"
          hint={
            landsInAnotherMonth
              ? `Counts towards ${formatters.period(occurredYear, occurredMonth)}.`
              : undefined
          }
        >
          {(field) => (
            <DatePicker
              {...field}
              value={date}
              onChange={(next) => next && setDate(next)}
              aria-label="Date"
            />
          )}
        </FormField>
        <FormField label="Note (optional)">
          {(field) => (
            <Input
              {...field}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note…"
            />
          )}
        </FormField>
      </form>
    </Dialog>
  );
}
