'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useActionState, useEffect, useState } from 'react';
import { Button, CurrencyInput, Dialog, FormField, Input, Select } from '@sovereignfs/ui';
import { createIncome } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import { CURRENCY_OPTIONS } from '../_lib/currency-options';
import styles from './Settings.module.css';

/**
 * Always creates `kind: 'secondary'` — a primary income already exists by
 * the time Settings is reachable (setup-status requires exactly one), so
 * there's nothing for this dialog to let a user choose.
 *
 * `currency`'s `useState` initializer only runs once, at first mount, but
 * this dialog stays mounted across opens (toggled via `open`) — the
 * `useEffect` re-syncs it to the current `baseCurrencyCode` on every open,
 * the same fix applied to `CreateCurrencyDialog`/`CreateCategoryDialog` for
 * the identical staleness bug.
 */
export function CreateIncomeDialog({
  open,
  onClose,
  baseCurrencyCode,
}: {
  open: boolean;
  onClose: () => void;
  baseCurrencyCode: string;
}) {
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [currency, setCurrency] = useState(baseCurrencyCode || 'EUR');
  const [amountCents, setAmountCents] = useState<number | null>(null);

  useEffect(() => {
    if (open) setCurrency(baseCurrencyCode || 'EUR');
  }, [open]);

  const [state, dispatch, pending] = useActionState<ActionResult | null, undefined>(async () => {
    const result = await createIncome({
      label,
      amountMinor: amountCents ?? 0,
      currency,
      kind: 'secondary',
    });
    if (result.ok) {
      router.refresh();
      setLabel('');
      setAmountCents(null);
      onClose();
    }
    return result;
  }, null);

  return (
    <Dialog open={open} onClose={onClose} size="sm" title="Add income" aria-label="Add income">
      <div className={styles.detailBody}>
        <FormField label="Label">
          {(field) => <Input {...field} value={label} onChange={(e) => setLabel(e.target.value)} />}
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
        <FormField label={`Amount (${currency})`}>
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
            disabled={!label.trim() || amountCents === null || pending}
          >
            Add income
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
