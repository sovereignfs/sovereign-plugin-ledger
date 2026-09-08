'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useActionState, useEffect, useState } from 'react';
import { Button, CurrencyInput, Dialog, FormField, Input, Select } from '@sovereignfs/ui';
import { createDeposit } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import styles from './Accounts.module.css';
import { CURRENCY_OPTIONS } from '../_lib/currency-options';

/**
 * Currency defaults to the user's base currency on every open — the dialog
 * stays mounted across opens, so a `useState` initializer alone would go
 * stale after a base-currency change (same fix as the Settings dialogs).
 */
export function CreateDepositDialog({
  open,
  onClose,
  baseCurrencyCode,
}: {
  open: boolean;
  onClose: () => void;
  baseCurrencyCode: string;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState(baseCurrencyCode || 'EUR');

  useEffect(() => {
    if (open) setCurrency(baseCurrencyCode || 'EUR');
  }, [open, baseCurrencyCode]);
  const [amountCents, setAmountCents] = useState<number | null>(null);

  const [state, dispatch, pending] = useActionState<ActionResult | null, undefined>(async () => {
    const result = await createDeposit({ name, amountMinor: amountCents ?? 0, currency });
    if (result.ok) {
      router.refresh();
      setName('');
      setAmountCents(null);
      onClose();
    }
    return result;
  }, null);

  return (
    <Dialog open={open} onClose={onClose} size="sm" title="Add deposit" aria-label="Add deposit">
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
            disabled={!name.trim() || pending}
          >
            Add deposit
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
