'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useActionState, useState } from 'react';
import { Button, CurrencyInput, Dialog, FormField } from '@sovereignfs/ui';
import { updateKindBudget } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import styles from './Budget.module.css';

/**
 * `updateKindBudget`'s own `refresh()` calls `revalidatePath('/ledger',
 * 'layout')`, which is what keeps the setup wizard's own route fresh — but
 * this dialog can be open on `/ledger/budget`, a sibling route, and
 * `router.refresh()` here is the one guaranteed way to force *this* route's
 * server data to refetch regardless of that call's exact layout-revalidation
 * scope. Safe to call unconditionally: `BudgetView` holds `data` as a plain
 * prop (not frozen into local state the way `SetupWizard` deliberately
 * freezes its own), so a fresh server render just flows new props into the
 * already-mounted client tree — no component-swap risk like the one
 * documented on `page.tsx`.
 *
 * Also the "Edit target" dialog for a saving jar — a jar's monthly target
 * is its saving kind's `predictedAmountMinor`, the same column.
 */
export function EditBudgetDialog({
  kindId,
  kindName,
  currentAmountMinor,
  currency,
  onClose,
}: {
  kindId: string;
  kindName: string;
  currentAmountMinor: number;
  currency: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [amountCents, setAmountCents] = useState<number | null>(currentAmountMinor);
  const [state, dispatch, pending] = useActionState<ActionResult | null, undefined>(async () => {
    const result = await updateKindBudget({
      kindId,
      predictedAmountMinor: amountCents ?? 0,
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
      title="Edit budgeted amount"
      aria-label="Edit budgeted amount"
    >
      <div className={styles.dialogBody}>
        <FormField label={`Budgeted amount for ${kindName} (${currency})`}>
          {(field) => (
            <CurrencyInput {...field} valueCents={amountCents} onValueChange={setAmountCents} />
          )}
        </FormField>
        {state && !state.ok && (
          <p className={styles.feedbackError} role="alert">
            {state.error}
          </p>
        )}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={() => startTransition(() => dispatch(undefined))}
            loading={pending}
            disabled={pending || amountCents === null}
          >
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
