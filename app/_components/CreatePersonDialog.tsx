'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useActionState, useState } from 'react';
import { Button, Dialog, FormField, Input, Select } from '@sovereignfs/ui';
import { createPerson } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import styles from './Accounts.module.css';
import { CURRENCY_OPTIONS } from '../_lib/currency-options';

export function CreatePersonDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('EUR');

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
