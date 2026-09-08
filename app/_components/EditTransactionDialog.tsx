'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useActionState, useEffect, useState } from 'react';
import {
  Button,
  CurrencyInput,
  DatePicker,
  Dialog,
  FormField,
  Input,
  Select,
  Spinner,
} from '@sovereignfs/ui';
import { getExpenseFormOptions, updateTransaction } from '../actions';
import type { ExpenseFormCategoryOption } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import type { BudgetTransaction } from '../_lib/budget';
import { fromOccurredAt } from '../_lib/format';
import { utcNoonOf } from '../_lib/period';
import styles from './AddExpenseDialog.module.css';

/**
 * Edit a logged expense — amount, subcategory, date, note. Mirrors
 * `AddExpenseDialog`'s form (same lazily-fetched category/kind options,
 * same UTC-noon date convention) minus the fund-from-jar toggle: a
 * jar-funded expense is a jar withdrawal row, edited from the jar itself,
 * never a `ledger_transactions` row.
 */
export function EditTransactionDialog({
  transaction,
  onClose,
}: {
  transaction: BudgetTransaction;
  onClose: () => void;
}) {
  const router = useRouter();
  const [categories, setCategories] = useState<ExpenseFormCategoryOption[] | null>(null);
  const [kindId, setKindId] = useState(transaction.kindId);
  const [categoryId, setCategoryId] = useState('');
  const [amountCents, setAmountCents] = useState<number | null>(transaction.amountMinor);
  const [date, setDate] = useState<Date>(() => fromOccurredAt(transaction.occurredAt));
  const [note, setNote] = useState(transaction.note ?? '');

  useEffect(() => {
    let cancelled = false;
    getExpenseFormOptions().then((result) => {
      if (cancelled) return;
      setCategories(result.categories);
      const owner = result.categories.find((c) => c.kinds.some((k) => k.id === transaction.kindId));
      setCategoryId(owner?.id ?? result.categories[0]?.id ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [transaction.kindId]);

  const selectedCategory = categories?.find((c) => c.id === categoryId) ?? null;
  const selectedKind = selectedCategory?.kinds.find((k) => k.id === kindId) ?? null;

  const [state, dispatch, pending] = useActionState<ActionResult | null, undefined>(async () => {
    const result = await updateTransaction({
      transactionId: transaction.id,
      kindId: selectedKind?.id ?? transaction.kindId,
      amountMinor: amountCents ?? 0,
      occurredAt: utcNoonOf(date),
      note: note.trim(),
    });
    if (result.ok) {
      router.refresh();
      onClose();
    }
    return result;
  }, null);

  const canSubmit = amountCents !== null && amountCents > 0 && selectedKind !== null && !pending;

  return (
    <Dialog open onClose={onClose} size="md" title="Edit expense" aria-label="Edit expense">
      {categories === null ? (
        <div className={styles.loading}>
          <Spinner label="Loading categories…" />
        </div>
      ) : (
        <div className={styles.body}>
          <FormField label={`Amount (${selectedKind?.currency ?? transaction.currency})`}>
            {(field) => (
              <CurrencyInput {...field} valueCents={amountCents} onValueChange={setAmountCents} />
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
          <FormField label="Date">
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
          {state && !state.ok && <p className={styles.feedbackError}>{state.error}</p>}
          <div className={styles.actions}>
            <Button variant="secondary" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button
              onClick={() => startTransition(() => dispatch(undefined))}
              loading={pending}
              disabled={!canSubmit}
            >
              Save
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
