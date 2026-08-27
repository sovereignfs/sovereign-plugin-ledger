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
  Toggle,
} from '@sovereignfs/ui';
import { createTransaction, getExpenseFormOptions } from '../actions';
import type { ExpenseFormCategoryOption } from '../actions';
import { fail, type ActionResult } from '../_lib/action-result';
import styles from './AddExpenseDialog.module.css';

/**
 * web-shell.md screen 6 — `Dialog` (`size="md"`), corrected from the
 * original wireframe's `Sheet` draft (no desktop equivalent). Rendered from
 * `LedgerSidebar` so "+ Add expense" works from any page under the shell,
 * which is also why its category/kind options are fetched lazily here via
 * `getExpenseFormOptions` rather than preloaded by a specific page — see
 * that action's own doc comment.
 *
 * No `useCommitOnEnterOrBlur` on amount/note: this dialog has its own
 * always-visible "Add expense" submit button, the documented exception in
 * CLAUDE.md's quick-entry-input rule (that rule is for fields that must
 * persist themselves on blur with no other affordance to do so).
 *
 * The wireframe draws an inline "EUR ▾" currency picker inside the amount
 * field — not built that way: `CurrencyInput` has no currency prop by
 * design, and every kind's currency is fixed at creation time (the wizard
 * is still the only path that sets one), so letting a user pick a
 * different currency here would just create an amount that disagrees with
 * the subcategory's own budget currency. The selected subcategory's
 * currency is shown read-only in the amount field's own label instead.
 */
export function AddExpenseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [categories, setCategories] = useState<ExpenseFormCategoryOption[] | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [kindId, setKindId] = useState('');
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [date, setDate] = useState<Date>(() => new Date());
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCategories(null);
    setAmountCents(null);
    setDate(new Date());
    setNote('');
    getExpenseFormOptions().then((result) => {
      if (cancelled) return;
      setCategories(result.categories);
      const firstCategory = result.categories[0];
      setCategoryId(firstCategory?.id ?? '');
      setKindId(firstCategory?.kinds[0]?.id ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedCategory = categories?.find((c) => c.id === categoryId) ?? null;
  const selectedKind = selectedCategory?.kinds.find((k) => k.id === kindId) ?? null;

  const [state, dispatch, pending] = useActionState<ActionResult | null, undefined>(async () => {
    if (!selectedKind) return fail('Choose a subcategory.');
    const result = await createTransaction({
      kindId: selectedKind.id,
      amountMinor: amountCents ?? 0,
      currency: selectedKind.currency,
      occurredAt: date.getTime(),
      note: note.trim() || undefined,
    });
    if (result.ok) {
      router.refresh();
      onClose();
    }
    return result;
  }, null);

  const canSubmit = amountCents !== null && amountCents > 0 && selectedKind !== null && !pending;

  return (
    <Dialog open={open} onClose={onClose} size="md" title="Add expense" aria-label="Add expense">
      {categories === null ? (
        <div className={styles.loading}>
          <Spinner label="Loading categories…" />
        </div>
      ) : (
        <div className={styles.body}>
          <FormField label={`Amount (${selectedKind?.currency ?? ''})`}>
            {(field) => (
              <CurrencyInput
                {...field}
                valueCents={amountCents}
                onValueChange={setAmountCents}
                placeholder="0.00"
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
                    const nextCategory = categories.find((c) => c.id === e.target.value);
                    setCategoryId(e.target.value);
                    setKindId(nextCategory?.kinds[0]?.id ?? '');
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
                value={date}
                onChange={setDate}
                aria-label="Date"
                placeholder="Select date"
                {...field}
              />
            )}
          </FormField>

          <div className={styles.jarRow}>
            <div className={styles.jarLabel}>
              <span>Fund from a saving jar</span>
              <span className={styles.jarHint}>Off — this counts as regular spending</span>
            </div>
            <Toggle
              checked={false}
              onChange={() => {}}
              disabled
              aria-label="Fund from a saving jar"
            />
          </div>

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
              Add expense
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
