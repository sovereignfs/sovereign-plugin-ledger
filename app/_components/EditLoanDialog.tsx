'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useActionState, useState } from 'react';
import { Button, CurrencyInput, DatePicker, Dialog, FormField, Input } from '@sovereignfs/ui';
import { updateLoan } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import type { LoanItem } from '../_lib/accounts';
import { fromDateOnly, toDateOnly } from '../_lib/format';
import styles from './Accounts.module.css';

/**
 * Editing name/installment here also updates the loan's linked kind (the
 * "Loans" fixed expense) — handled server-side in `updateLoan`, not
 * duplicated here.
 */
export function EditLoanDialog({ loan, onClose }: { loan: LoanItem; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(loan.name);
  const [lender, setLender] = useState(loan.lender);
  const [remainingCents, setRemainingCents] = useState<number | null>(loan.remainingBalanceMinor);
  const [installmentCents, setInstallmentCents] = useState<number | null>(
    loan.installmentAmountMinor,
  );
  const [endDate, setEndDate] = useState<Date | null>(fromDateOnly(loan.endDate));

  const [state, dispatch, pending] = useActionState<ActionResult | null, undefined>(async () => {
    const result = await updateLoan({
      loanId: loan.id,
      name,
      lender,
      remainingBalanceMinor: remainingCents ?? 0,
      installmentAmountMinor: installmentCents ?? 0,
      endDate: endDate ? toDateOnly(endDate) : undefined,
    });
    if (result.ok) {
      router.refresh();
      onClose();
    }
    return result;
  }, null);

  return (
    <Dialog open onClose={onClose} size="md" title="Edit loan" aria-label="Edit loan">
      <div className={styles.detailBody}>
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
        <FormField label={`Remaining balance (${loan.currency})`}>
          {(field) => (
            <CurrencyInput {...field} valueCents={remainingCents} onValueChange={setRemainingCents} />
          )}
        </FormField>
        <FormField label={`Monthly installment (${loan.currency})`}>
          {(field) => (
            <CurrencyInput
              {...field}
              valueCents={installmentCents}
              onValueChange={setInstallmentCents}
            />
          )}
        </FormField>
        <FormField label="End date">
          {(field) => (
            <DatePicker {...field} value={endDate} onChange={setEndDate} aria-label="End date" />
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
            disabled={!name.trim() || !lender.trim() || pending}
          >
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
