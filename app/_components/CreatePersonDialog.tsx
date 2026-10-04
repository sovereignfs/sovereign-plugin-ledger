'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useActionState, useEffect, useState } from 'react';
import { Button, Dialog, FormField, Input } from '@sovereignfs/ui';
import { CurrencyPicker } from './CurrencyPicker';
import { createPerson } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import styles from './Accounts.module.css';

/**
 * Currency defaults to the user's base currency on every open — the dialog
 * stays mounted across opens, so a `useState` initializer alone would go
 * stale after a base-currency change (same fix as the Settings dialogs).
 */
export function CreatePersonDialog({
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

  const [state, dispatch, pending] = useActionState<ActionResult | null, undefined>(async () => {
    const result = await createPerson({ name, currency });
    if (result.ok) {
      router.refresh();
      setName('');
      onClose();
    }
    return result;
  }, null);

  return (
    <Dialog open={open} onClose={onClose} size="sm" title="Add person" aria-label="Add person">
      <div className={styles.detailBody}>
        <FormField label="Name">
          {(field) => <Input {...field} value={name} onChange={(e) => setName(e.target.value)} />}
        </FormField>
        <FormField label="Currency">
          {(field) => <CurrencyPicker {...field} value={currency} onChange={setCurrency} />}
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
            Add person
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
