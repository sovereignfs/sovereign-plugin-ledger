'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useActionState, useState } from 'react';
import { Button, CurrencyInput, Dialog, FormField, Input, SegmentedControl } from '@sovereignfs/ui';
import { createPeopleTransaction } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import type { PersonItem } from '../_lib/accounts';
import styles from './Accounts.module.css';

/**
 * `createPeopleTransaction` takes one signed `amountMinor` (positive = they
 * now owe more, negative = they paid some down — `ledger_people`'s own
 * documented convention). The amount field itself always takes a positive
 * magnitude; this direction toggle is what decides the sign, clearer than
 * asking a user to type a leading "-".
 */
export function RecordPersonTransactionDialog({
  person,
  onClose,
}: {
  person: PersonItem;
  onClose: () => void;
}) {
  const router = useRouter();
  const [direction, setDirection] = useState<'owes-more' | 'paid-back'>('owes-more');
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [note, setNote] = useState('');

  const [state, dispatch, pending] = useActionState<ActionResult | null, undefined>(async () => {
    const magnitude = amountCents ?? 0;
    const signedAmountMinor = direction === 'owes-more' ? magnitude : -magnitude;
    const result = await createPeopleTransaction({
      personId: person.id,
      amountMinor: signedAmountMinor,
      note: note.trim() || undefined,
    });
    if (result.ok) {
      router.refresh();
      onClose();
    }
    return result;
  }, null);

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={`Record a transaction — ${person.name}`}
      aria-label="Record a transaction"
    >
      <div className={styles.detailBody}>
        <SegmentedControl
          value={direction}
          onChange={setDirection}
          aria-label="Direction"
          options={[
            { label: 'They owe me more', value: 'owes-more' },
            { label: 'They paid me back', value: 'paid-back' },
          ]}
        />
        <FormField label={`Amount (${person.currency})`}>
          {(field) => (
            <CurrencyInput {...field} valueCents={amountCents} onValueChange={setAmountCents} />
          )}
        </FormField>
        <FormField label="Note (optional)">
          {(field) => <Input {...field} value={note} onChange={(e) => setNote(e.target.value)} />}
        </FormField>
        {state && !state.ok && <p className={styles.feedbackError}>{state.error}</p>}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={() => startTransition(() => dispatch(undefined))}
            loading={pending}
            disabled={!amountCents || pending}
          >
            Record
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
