'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useActionState, useState } from 'react';
import { Button, CurrencyInput, Dialog, FormField, Input, SegmentedControl, Select } from '@sovereignfs/ui';
import { createAsset } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import styles from './Accounts.module.css';
import { CURRENCY_OPTIONS } from '../_lib/currency-options';

export function CreateAssetDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [type, setType] = useState<'physical' | 'security'>('physical');
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('EUR');
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
        <FormField label={`Value (${currency})`}>
          {(field) => <CurrencyInput {...field} valueCents={valueCents} onValueChange={setValueCents} />}
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
