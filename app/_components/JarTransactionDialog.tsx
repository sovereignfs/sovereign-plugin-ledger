'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useActionState, useState } from 'react';
import {
  Button,
  CurrencyInput,
  DatePicker,
  Dialog,
  FormField,
  Input,
  SegmentedControl,
} from '@sovereignfs/ui';
import { createJarTransaction } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import { utcNoonOf } from '../_lib/period';
import styles from './Budget.module.css';

/**
 * Contribution and withdrawal share one dialog (a `SegmentedControl`
 * picking direction, matching `CreateAccountDialog`'s own bank/credit-card
 * picker precedent) rather than two separate dialogs — the form is
 * otherwise identical (amount + date + note), and `createJarTransaction`
 * already takes one signed amount rather than a direction enum plus
 * magnitude. The action's own overdraft guard is the real validation; this
 * dialog doesn't duplicate it client-side.
 *
 * The chosen day is stored as UTC noon (`utcNoonOf`) so it lands in the
 * month the user meant regardless of their timezone — see `period.ts`.
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
  const [date, setDate] = useState<Date>(() => new Date());
  const [note, setNote] = useState('');

  const [state, dispatch, pending] = useActionState<ActionResult | null, undefined>(async () => {
    const magnitude = amountCents ?? 0;
    const result = await createJarTransaction({
      jarId,
      amountMinor: direction === 'withdraw' ? -magnitude : magnitude,
      occurredAt: utcNoonOf(date),
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
        <FormField label="Date">
          {(field) => (
            <DatePicker
              {...field}
              value={date}
              onChange={(next) => next && setDate(next)}
              aria-label="Date"
            />
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
