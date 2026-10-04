'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useActionState, useEffect, useState } from 'react';
import { Button, Dialog, FormField, Input, SegmentedControl } from '@sovereignfs/ui';
import { CurrencyPicker } from './CurrencyPicker';
import { MoneyInput } from './MoneyInput';
import { createCategoryWithKind } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import styles from './Settings.module.css';

/**
 * Calls the already-existing `createCategoryWithKind` (built for the setup
 * wizard and `CreateSavingJarDialog`, L.12) directly — a category with no
 * kind is invisible everywhere else in the app (Budget/Overview skip
 * zero-kind categories), so this always creates the category and its first,
 * same-named kind together in one action, never a bare `createCategory`.
 *
 * `currency`'s initial `useState` value is only computed once, at this
 * dialog's first mount (it stays mounted across opens, toggled via `open`
 * — same as every other dialog in this app). The `useEffect` below re-syncs
 * it to the current `baseCurrencyCode` on every open, so changing the base
 * currency in this same session (without a full page reload) doesn't leave
 * new categories silently defaulting to a stale currency — the exact same
 * staleness bug found and fixed in `CreateCurrencyDialog`.
 */
export function CreateCategoryDialog({
  open,
  onClose,
  baseCurrencyCode,
}: {
  open: boolean;
  onClose: () => void;
  baseCurrencyCode: string;
}) {
  const router = useRouter();
  const [type, setType] = useState<'dynamic' | 'fixed'>('dynamic');
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState(baseCurrencyCode || 'EUR');
  const [amountCents, setAmountCents] = useState<number | null>(null);

  useEffect(() => {
    if (open) setCurrency(baseCurrencyCode || 'EUR');
  }, [open]);

  const [state, dispatch, pending] = useActionState<ActionResult | null, undefined>(async () => {
    const result = await createCategoryWithKind({
      name,
      type,
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
    <Dialog open={open} onClose={onClose} size="sm" title="Add category" aria-label="Add category">
      <div className={styles.detailBody}>
        <SegmentedControl
          value={type}
          onChange={setType}
          aria-label="Category type"
          options={[
            { label: 'Dynamic', value: 'dynamic' },
            { label: 'Fixed', value: 'fixed' },
          ]}
        />
        <FormField label="Name">
          {(field) => <Input {...field} value={name} onChange={(e) => setName(e.target.value)} />}
        </FormField>
        <FormField label="Currency">
          {(field) => <CurrencyPicker {...field} value={currency} onChange={setCurrency} />}
        </FormField>
        <FormField label={`Budgeted amount (${currency})`}>
          {(field) => (
            <MoneyInput
              currency={currency}
              {...field}
              valueCents={amountCents}
              onValueChange={setAmountCents}
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
            disabled={!name.trim() || amountCents === null || pending}
          >
            Add category
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
