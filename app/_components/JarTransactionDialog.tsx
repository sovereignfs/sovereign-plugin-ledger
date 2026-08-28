'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useActionState, useState } from 'react';
import { Button, CurrencyInput, Dialog, FormField, Input, SegmentedControl } from '@sovereignfs/ui';
import { createJarTransaction } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import styles from './Budget.module.css';

/**
 * Contribution and withdrawal share one dialog (a `SegmentedControl`
 * picking direction, matching `CreateAccountDialog`'s own bank/credit-card
 * picker precedent) rather than two separate dialogs — the form is
 * otherwise identical (amount + note), and `createJarTransaction` already
 * takes one signed amount rather than a direction enum plus magnitude.
 * `Math.abs(amountCents)` is negated for a withdrawal at submit time; the
 * action's own overdraft guard is the real validation, this dialog doesn't
 * duplicate it client-side.
 */
export function JarTransactionDialog({
  jarId,
  jarName,
  currency,
  onClose,
}: {
  jarId: string;
  jarName: string;
  currency: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [direction, setDirection] = useState<'contribute' | 'withdraw'>('contribute');
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [note, setNote] = useState('');

  const [state, dispatch, pending] = useActionState<ActionResult | null, undefined>(async () => {
    const magnitude = amountCents ?? 0;
    const result = await createJarTransaction({
      jarId,
      amountMinor: direction === 'withdraw' ? -magnitude : magnitude,
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
      title={jarName}
      aria-label={`Add money to or withdraw from ${jarName}`}
    >
      <div className={styles.dialogBody}>
        <SegmentedControl
          value={direction}
          onChange={setDirection}
          aria-label="Direction"
          options={[
            { label: 'Add money', value: 'contribute' },
            { label: 'Withdraw', value: 'withdraw' },
          ]}
        />
        <FormField label={`Amount (${currency})`}>
          {(field) => (
            <CurrencyInput {...field} valueCents={amountCents} onValueChange={setAmountCents} />
          )}
        </FormField>
        <FormField label="Note (optional)">
          {(field) => (
            <Input
              {...field}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note…"
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
            disabled={!amountCents || pending}
          >
            {direction === 'withdraw' ? 'Withdraw' : 'Add money'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
