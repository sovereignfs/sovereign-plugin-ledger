'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useActionState, useState } from 'react';
import { Button, Dialog, FormField, Input } from '@sovereignfs/ui';
import { MoneyInput } from './MoneyInput';
import { updateDeposit } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import type { DepositItem } from '../_lib/accounts';
import styles from './Accounts.module.css';

export function EditDepositDialog({
  deposit,
  onClose,
}: {
  deposit: DepositItem;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(deposit.name);
  const [amountCents, setAmountCents] = useState<number | null>(deposit.amountMinor);

  const [state, dispatch, pending] = useActionState<ActionResult | null, undefined>(async () => {
    const result = await updateDeposit({
      depositId: deposit.id,
      name,
      amountMinor: amountCents ?? 0,
    });
    if (result.ok) {
      router.refresh();
      onClose();
    }
    return result;
  }, null);

  return (
    <Dialog open onClose={onClose} size="sm" title="Edit deposit" aria-label="Edit deposit">
      <div className={styles.detailBody}>
        <FormField label="Name">
          {(field) => <Input {...field} value={name} onChange={(e) => setName(e.target.value)} />}
        </FormField>
        <FormField label={`Amount (${deposit.currency})`}>
          {(field) => (
            <MoneyInput
              currency={deposit.currency}
              {...field}
              valueCents={amountCents}
              onValueChange={setAmountCents}
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
            disabled={!name.trim() || amountCents === null || pending}
          >
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
