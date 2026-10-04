'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useActionState, useEffect, useState } from 'react';
import { Button, Dialog, FormField, Input, SegmentedControl } from '@sovereignfs/ui';
import { CurrencyPicker } from './CurrencyPicker';
import { MoneyInput } from './MoneyInput';
import { createAsset } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import styles from './Accounts.module.css';

/**
 * Currency defaults to the user's base currency on every open — the dialog
 * stays mounted across opens, so a `useState` initializer alone would go
 * stale after a base-currency change (same fix as the Settings dialogs).
 */
export function CreateAssetDialog({
  open,
  onClose,
  baseCurrencyCode,
}: {
  open: boolean;
  onClose: () => void;
  baseCurrencyCode: string;
}) {
  const router = useRouter();
  const [type, setType] = useState<'physical' | 'security'>('physical');
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState(baseCurrencyCode || 'EUR');

  useEffect(() => {
    if (open) setCurrency(baseCurrencyCode || 'EUR');
  }, [open, baseCurrencyCode]);
  const [valueCents, setValueCents] = useState<number | null>(null);

  const [state, dispatch, pending] = useActionState<ActionResult | null, undefined>(async () => {
    const result = await createAsset({ name, type, valueMinor: valueCents ?? 0, currency });
    if (result.ok) {
      router.refresh();
      setName('');
      setValueCents(null);
      onClose();
    }
    return result;
  }, null);

  return (
    <Dialog open={open} onClose={onClose} size="sm" title="Add asset" aria-label="Add asset">
      <div className={styles.detailBody}>
        <SegmentedControl
          value={type}
          onChange={setType}
          aria-label="Asset type"
          options={[
            { label: 'Physical', value: 'physical' },
            { label: 'Security', value: 'security' },
          ]}
        />
        <FormField label="Name">
          {(field) => <Input {...field} value={name} onChange={(e) => setName(e.target.value)} />}
        </FormField>
        <FormField label="Currency">
          {(field) => <CurrencyPicker {...field} value={currency} onChange={setCurrency} />}
        </FormField>
        <FormField label={`Value (${currency})`}>
          {(field) => (
            <MoneyInput
              currency={currency}
              {...field}
              valueCents={valueCents}
              onValueChange={setValueCents}
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
            disabled={!name.trim() || pending}
          >
            Add asset
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
