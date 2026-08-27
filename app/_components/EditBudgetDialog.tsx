'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useActionState, useEffect, useState } from 'react';
import { Button, CurrencyInput, Dialog, FormField } from '@sovereignfs/ui';
import { updateKindBudget } from '../actions';
import type { ActionResult } from '../_lib/action-result';

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
    return result;
  }, null);

  // Deliberately keyed on `state` alone — this should re-run only on a
  // fresh state.ok transition, not whenever `router`/`onClose` change
  // identity (the react-hooks exhaustive-deps rule isn't enabled in this
  // repo's ESLint config, so there's no lint suppression needed for this).
  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onClose();
    }
  }, [state]);

  return (
    <Dialog open onClose={onClose} size="sm" title="Edit budgeted amount" aria-label="Edit budgeted amount">
      <FormField label={`Budgeted amount for ${kindName} (${currency})`}>
        {(field) => (
          <CurrencyInput {...field} valueCents={amountCents} onValueChange={setAmountCents} />
        )}
      </FormField>
      {state && !state.ok && <p role="alert">{state.error}</p>}
      <Button
        onClick={() => startTransition(() => dispatch(undefined))}
        loading={pending}
        disabled={pending || amountCents === null}
      >
        Save
      </Button>
    </Dialog>
  );
}
