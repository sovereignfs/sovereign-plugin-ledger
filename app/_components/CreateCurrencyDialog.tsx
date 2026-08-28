'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useActionState, useEffect, useState } from 'react';
import { Button, Dialog, FormField, Select } from '@sovereignfs/ui';
import { createCurrency } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import { CURRENCY_OPTIONS } from '../_lib/currency-options';
import styles from './Settings.module.css';

/**
 * Added as non-base by default — promoting a currency to base is a
 * separate "Set as base" action per already-added row, never chosen here.
 *
 * This dialog stays mounted across opens (`SettingsView` toggles it via
 * `open`, matching every other dialog in this app), so `code`'s initial
 * `useState` value is only ever computed once, at first mount — reopening
 * after `existingCodes` changes (e.g. the previously-default currency was
 * just added) would otherwise leave `code` pointing at a now-unavailable
 * code, silently resubmitting whatever was selected on the *previous* open
 * instead of what the visibly-reset `<select>` currently shows. The
 * `useEffect` below re-syncs `code` to the current default every time the
 * dialog actually opens, deliberately keyed on `open` alone (not
 * `available`, which is a fresh array every render and would otherwise
 * reset a user's in-progress manual selection on every keystroke).
 */
export function CreateCurrencyDialog({
  open,
  onClose,
  existingCodes,
}: {
  open: boolean;
  onClose: () => void;
  existingCodes: string[];
}) {
  const router = useRouter();
  const available = CURRENCY_OPTIONS.filter((c) => !existingCodes.includes(c.code));
  const [code, setCode] = useState(available[0]?.code ?? '');

  useEffect(() => {
    if (open) setCode(available[0]?.code ?? '');
  }, [open]);

  const [state, dispatch, pending] = useActionState<ActionResult | null, undefined>(async () => {
    const result = await createCurrency({ code });
    if (result.ok) {
      router.refresh();
      onClose();
    }
    return result;
  }, null);

  return (
    <Dialog open={open} onClose={onClose} size="sm" title="Add currency" aria-label="Add currency">
      <div className={styles.detailBody}>
        {available.length === 0 ? (
          <p className={styles.emptyState}>Every supported currency is already added.</p>
        ) : (
          <FormField label="Currency">
            {(field) => (
              <Select {...field} value={code} onChange={(e) => setCode(e.target.value)}>
                {available.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </Select>
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
            disabled={!code || pending || available.length === 0}
          >
            Add currency
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
