'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useActionState, useState } from 'react';
import {
  Button,
  CurrencyInput,
  Dialog,
  FormField,
  Input,
  SegmentedControl,
  Select,
} from '@sovereignfs/ui';
import { createAccount } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import styles from './Accounts.module.css';
import { CURRENCY_OPTIONS } from '../_lib/currency-options';

export function CreateAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [type, setType] = useState<'bank' | 'credit_card'>('bank');
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [creditLimitCents, setCreditLimitCents] = useState<number | null>(null);

  const [state, dispatch, pending] = useActionState<ActionResult | null, undefined>(async () => {
    const result = await createAccount({
      name,
      institution: institution.trim() || undefined,
      type,
      balanceMinor: balanceCents ?? 0,
      currency,
      creditLimitMinor: type === 'credit_card' ? (creditLimitCents ?? undefined) : undefined,
    });
    if (result.ok) {
      router.refresh();
      setName('');
      setInstitution('');
      setBalanceCents(null);
      setCreditLimitCents(null);
      onClose();
    }
    return result;
  }, null);

  return (
    <Dialog open={open} onClose={onClose} size="sm" title="Add account" aria-label="Add account">
      <div className={styles.detailBody}>
        <SegmentedControl
          value={type}
          onChange={setType}
          aria-label="Account type"
          options={[
            { label: 'Bank account', value: 'bank' },
            { label: 'Credit card', value: 'credit_card' },
          ]}
        />
        <FormField label="Name">
          {(field) => <Input {...field} value={name} onChange={(e) => setName(e.target.value)} />}
        </FormField>
        <FormField label="Institution (optional)">
          {(field) => (
            <Input {...field} value={institution} onChange={(e) => setInstitution(e.target.value)} />
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
        <FormField label={type === 'credit_card' ? 'Current balance owed' : `Balance (${currency})`}>
          {(field) => (
            <CurrencyInput {...field} valueCents={balanceCents} onValueChange={setBalanceCents} />
          )}
        </FormField>
        {type === 'credit_card' && (
          <FormField label={`Credit limit (${currency})`}>
            {(field) => (
              <CurrencyInput
                {...field}
                valueCents={creditLimitCents}
                onValueChange={setCreditLimitCents}
              />
            )}
          </FormField>
        )}
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
            Add account
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
