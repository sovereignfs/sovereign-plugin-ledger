'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useActionState, useState } from 'react';
import { Button, CurrencyInput, Dialog, FormField, Input } from '@sovereignfs/ui';
import { createKind } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import styles from './Settings.module.css';

/**
 * Adds a subcategory to an already-existing category — `createKind`, not
 * `createCategoryWithKind` (that's for a brand-new category). No currency
 * picker: every subcategory in a category shares the category's currency
 * (category totals sum subcategories raw), and `createKind` rejects a
 * mismatch server-side — so the currency is shown, not chosen. No
 * recurrence field: every kind's period is treated as a calendar month
 * today (see `period.ts`'s documented v1 simplification).
 */
export function CreateKindDialog({
  open,
  onClose,
  categoryId,
  categoryCurrency,
}: {
  open: boolean;
  onClose: () => void;
  categoryId: string;
  categoryCurrency: string;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [amountCents, setAmountCents] = useState<number | null>(null);

  const [state, dispatch, pending] = useActionState<ActionResult | null, undefined>(async () => {
    const result = await createKind({
      categoryId,
      name,
      predictedAmountMinor: amountCents ?? 0,
      currency: categoryCurrency,
    });
    if (result.ok) {
      router.refresh();
      setName('');
      setAmountCents(null);
      onClose();
    }
    return result;
  }, null);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Add subcategory"
      aria-label="Add subcategory"
    >
      <div className={styles.detailBody}>
        <FormField label="Name">
          {(field) => <Input {...field} value={name} onChange={(e) => setName(e.target.value)} />}
        </FormField>
        <FormField label={`Budgeted amount (${categoryCurrency})`}>
          {(field) => (
            <CurrencyInput {...field} valueCents={amountCents} onValueChange={setAmountCents} />
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
            disabled={!name.trim() || amountCents === null || pending}
          >
            Add subcategory
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
