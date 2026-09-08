'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useActionState, useState } from 'react';
import { Button, CurrencyInput, Dialog, FormField, Input } from '@sovereignfs/ui';
import { updateAccount } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import type { AccountItem } from '../_lib/accounts';
import styles from './Accounts.module.css';

/**
 * Update a bank account's or card's balance (the core recurring action for
 * a manually-maintained net worth), plus name/institution/limit. Currency
 * is fixed at creation — changing it would silently re-denominate a balance.
 */
export function EditAccountDialog({
  account,
  onClose,
}: {
  account: AccountItem;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(account.name);
  const [institution, setInstitution] = useState(account.institution ?? '');
  const [balanceCents, setBalanceCents] = useState<number | null>(account.balanceMinor);
  const [creditLimitCents, setCreditLimitCents] = useState<number | null>(account.creditLimitMinor);

  const [state, dispatch, pending] = useActionState<ActionResult | null, undefined>(async () => {
    const result = await updateAccount({
      accountId: account.id,
      name,
      institution,
      balanceMinor: balanceCents ?? 0,
      ...(account.type === 'credit_card' ? { creditLimitMinor: creditLimitCents } : {}),
    });
    if (result.ok) {
      router.refresh();
      onClose();
    }
    return result;
  }, null);

  const isCard = account.type === 'credit_card';

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={isCard ? 'Edit credit card' : 'Edit account'}
      aria-label={isCard ? 'Edit credit card' : 'Edit account'}
    >
      <div className={styles.detailBody}>
        <FormField label="Name">
          {(field) => <Input {...field} value={name} onChange={(e) => setName(e.target.value)} />}
        </FormField>
        <FormField label="Institution (optional)">
          {(field) => (
            <Input
              {...field}
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
            />
          )}
        </FormField>
        <FormField
          label={
            isCard ? `Current balance owed (${account.currency})` : `Balance (${account.currency})`
          }
        >
          {(field) => (
            <CurrencyInput {...field} valueCents={balanceCents} onValueChange={setBalanceCents} />
          )}
        </FormField>
        {isCard && (
          <FormField label={`Credit limit (${account.currency})`}>
            {(field) => (
              <CurrencyInput
                {...field}
                valueCents={creditLimitCents}
                onValueChange={setCreditLimitCents}
              />
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
            disabled={!name.trim() || balanceCents === null || pending}
          >
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
