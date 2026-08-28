'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useActionState, useState } from 'react';
import { Button, CurrencyInput, Dialog, FormField, Input, Select } from '@sovereignfs/ui';
import { createKind } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import { CURRENCY_OPTIONS } from '../_lib/currency-options';
import styles from './Settings.module.css';

/**
 * Adds a subcategory to an already-existing category — `createKind`, not
 * `createCategoryWithKind` (that's for a brand-new category). No recurrence
 * field: no other kind-creation path in this app exposes one yet (the
 * schema carries `recurrence*` columns, but every kind's period is treated
 * as a calendar month today — see `period.ts`'s own documented v1
 * simplification), so adding one only here would be inconsistent.
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
  const [currency, setCurrency] = useState(categoryCurrency);
  const [amountCents, setAmountCents] = useState<number | null>(null);

  const [state, dispatch, pending] = useActionState<ActionResult | null, undefined>(async () => {
    const result = await createKind({
      categoryId,
      name,
      predictedAmountMinor: amountCents ?? 0,
      currency,
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
        <FormField label="Currency">
          {(field) => (
            <Select {...field} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label={`Budgeted amount (${currency})`}>
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
