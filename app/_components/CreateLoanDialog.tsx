'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useActionState, useState } from 'react';
import { Button, CurrencyInput, DatePicker, Dialog, FormField, Input, Select } from '@sovereignfs/ui';
import { createLoan } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import { toDateOnly } from '../_lib/format';
import styles from './Accounts.module.css';
import { CURRENCY_OPTIONS } from './SetupWizard';

export function CreateLoanDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [lender, setLender] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [principalCents, setPrincipalCents] = useState<number | null>(null);
  const [remainingCents, setRemainingCents] = useState<number | null>(null);
  const [installmentCents, setInstallmentCents] = useState<number | null>(null);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  const [state, dispatch, pending] = useActionState<ActionResult | null, undefined>(async () => {
    if (!startDate || !endDate) return { ok: false, error: 'Start and end dates are required.' };
    const result = await createLoan({
      name,
      lender,
      principalMinor: principalCents ?? 0,
      remainingBalanceMinor: remainingCents ?? 0,
      installmentAmountMinor: installmentCents ?? 0,
      currency,
      startDate: toDateOnly(startDate),
      endDate: toDateOnly(endDate),
    });
    if (result.ok) {
      router.refresh();
      setName('');
      setLender('');
      setPrincipalCents(null);
      setRemainingCents(null);
      setInstallmentCents(null);
      setStartDate(null);
      setEndDate(null);
      onClose();
    }
    return result;
  }, null);

  const canSubmit =
    name.trim().length > 0 &&
    lender.trim().length > 0 &&
    principalCents !== null &&
    remainingCents !== null &&
    installmentCents !== null &&
    startDate !== null &&
    endDate !== null &&
    !pending;

  return (
    <Dialog open={open} onClose={onClose} size="md" title="Add loan" aria-label="Add loan">
      <div className={styles.detailBody}>
        <p className={styles.linkedNote}>
          Adding a loan creates a matching &quot;Loans&quot; fixed expense with this
          installment as its budget — log payments against it from Add expense as normal.
        </p>
        <div className={styles.statGrid}>
          <FormField label="Name">
            {(field) => <Input {...field} value={name} onChange={(e) => setName(e.target.value)} />}
          </FormField>
          <FormField label="Lender">
            {(field) => (
              <Input {...field} value={lender} onChange={(e) => setLender(e.target.value)} />
            )}
          </FormField>
        </div>
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
        <div className={styles.statGrid}>
          <FormField label="Principal">
            {(field) => (
              <CurrencyInput {...field} valueCents={principalCents} onValueChange={setPrincipalCents} />
            )}
          </FormField>
          <FormField label="Remaining balance">
            {(field) => (
              <CurrencyInput {...field} valueCents={remainingCents} onValueChange={setRemainingCents} />
            )}
          </FormField>
        </div>
        <FormField label="Monthly installment">
          {(field) => (
            <CurrencyInput
              {...field}
              valueCents={installmentCents}
              onValueChange={setInstallmentCents}
            />
          )}
        </FormField>
        <div className={styles.statGrid}>
          <FormField label="Start date">
            {(field) => (
              <DatePicker {...field} value={startDate} onChange={setStartDate} aria-label="Start date" />
            )}
          </FormField>
          <FormField label="End date">
            {(field) => (
              <DatePicker {...field} value={endDate} onChange={setEndDate} aria-label="End date" />
            )}
          </FormField>
        </div>
        {state && !state.ok && <p className={styles.feedbackError}>{state.error}</p>}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={() => startTransition(() => dispatch(undefined))}
            loading={pending}
            disabled={!canSubmit}
          >
            Add loan
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
