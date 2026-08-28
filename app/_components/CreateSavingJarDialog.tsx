'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useActionState, useState } from 'react';
import { Button, CurrencyInput, Dialog, FormField, Input, Select } from '@sovereignfs/ui';
import { createCategoryWithKind } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import { CURRENCY_OPTIONS } from '../_lib/currency-options';
import styles from './Budget.module.css';

/**
 * L.12 — the entry point Budget's own Saving section needs, since nothing
 * else creates a saving-type category+kind (the setup wizard, L.4, only
 * ever writes `type: 'dynamic'`). `createCategoryWithKind` with
 * `type: 'saving'` also creates the linked jar server-side in the same
 * transaction — this dialog only collects the name and monthly target.
 *
 * Dynamic/Fixed categories have no equivalent "add" dialog anywhere in the
 * app today (a pre-existing gap, not introduced or fixed here) — this is
 * deliberately scoped to just Saving, the one category type L.12 actually
 * needs a creation flow for.
 */
export function CreateSavingJarDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [amountCents, setAmountCents] = useState<number | null>(null);

  const [state, dispatch, pending] = useActionState<ActionResult | null, undefined>(async () => {
    const result = await createCategoryWithKind({
      type: 'saving',
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
    <Dialog open={open} onClose={onClose} size="sm" title="New saving jar" aria-label="New saving jar">
      <div className={styles.dialogBody}>
        <FormField label="Name">
          {(field) => (
            <Input
              {...field}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Travel jar"
            />
          )}
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
        <FormField label={`Monthly target (${currency})`}>
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
            disabled={!name.trim() || pending}
          >
            Create jar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
