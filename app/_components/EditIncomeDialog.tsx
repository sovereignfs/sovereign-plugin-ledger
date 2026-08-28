'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useActionState, useState } from 'react';
import { Button, CurrencyInput, Dialog, FormField, Input } from '@sovereignfs/ui';
import { updateIncome } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import styles from './Settings.module.css';

export function EditIncomeDialog({
  open,
  onClose,
  incomeId,
  currentLabel,
  currentAmountMinor,
  currency,
}: {
  open: boolean;
  onClose: () => void;
  incomeId: string;
  currentLabel: string;
  currentAmountMinor: number;
  currency: string;
}) {
  const router = useRouter();
  const [label, setLabel] = useState(currentLabel);
  const [amountCents, setAmountCents] = useState<number | null>(currentAmountMinor);

  const [state, dispatch, pending] = useActionState<ActionResult | null, undefined>(async () => {
    const result = await updateIncome({ incomeId, label, amountMinor: amountCents ?? 0 });
    if (result.ok) {
      router.refresh();
      onClose();
    }
    return result;
  }, null);

  return (
    <Dialog open={open} onClose={onClose} size="sm" title="Edit income" aria-label="Edit income">
      <div className={styles.detailBody}>
        <FormField label="Label">
          {(field) => <Input {...field} value={label} onChange={(e) => setLabel(e.target.value)} />}
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
            disabled={!label.trim() || amountCents === null || pending}
          >
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
