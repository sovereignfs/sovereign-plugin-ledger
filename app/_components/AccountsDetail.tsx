'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BalanceChip, Button, ConfirmDialog, Progress } from '@sovereignfs/ui';
import {
  deleteAccount,
  deleteAsset,
  deleteDeposit,
  deleteLoan,
  deletePerson,
} from '../actions';
import { formatMoney, fromDateOnly } from '../_lib/format';
import type { AccountsData } from '../_lib/accounts';
import styles from './Accounts.module.css';
import type { SelectedItem } from './AccountsView';
import { EditLoanDialog } from './EditLoanDialog';
import { RecordPersonTransactionDialog } from './RecordPersonTransactionDialog';

function monthYear(dateOnly: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(
    fromDateOnly(dateOnly),
  );
}

/** Shared delete affordance — every entity type in this detail column has one. */
function DeleteButton({
  label,
  onDelete,
}: {
  label: string;
  onDelete: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  return (
    <>
      <Button variant="destructive" onClick={() => setConfirming(true)}>
        Delete
      </Button>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Delete ${label}?`}
        message={`This removes "${label}" and can't be undone.`}
        destructive
        pending={pending}
        error={error}
        confirmLabel={pending ? 'Deleting…' : 'Delete'}
        onConfirm={async () => {
          setPending(true);
          const result = await onDelete();
          setPending(false);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.refresh();
          setConfirming(false);
        }}
      />
    </>
  );
}

/**
 * web-shell.md screen 4's detail column — content shape varies by entity
 * type. Only Loans get a full edit flow (matching the wireframe's own
 * "Edit loan" affordance and the L.7 review checklist's specific focus);
 * accounts/assets/deposits/people are view + delete only for this task —
 * `updateAccount`/`updateAsset`/`updateDeposit` exist in the actions layer
 * for consistency but have no wired-up edit UI yet, a deliberate scope cut
 * rather than an oversight.
 */
export function AccountsDetail({
  data,
  selected,
  onDeselect,
}: {
  data: AccountsData;
  selected: NonNullable<SelectedItem>;
  onDeselect: () => void;
}) {
  // Hooks called unconditionally, before the type-switch below — this
  // component is remounted (via a `key` in AccountsView) on every selection
  // change, so this state never needs to be reset manually, but it still
  // must not live inside a conditional branch or after an early return.
  const [editingLoan, setEditingLoan] = useState(false);
  const [recordingPersonTx, setRecordingPersonTx] = useState(false);

  if (selected.type === 'account') {
    const account = [...data.banking, ...data.creditCards].find((a) => a.id === selected.id);
    if (!account) return null;
    return (
      <div>
        <div className={styles.detailHeader}>
          <h2 className={styles.detailTitle}>{account.name}</h2>
          {account.institution && <p className={styles.detailSubtitle}>{account.institution}</p>}
        </div>
        <div className={styles.detailBody}>
          <div className={styles.statGrid}>
            <div>
              <p className={styles.statLabel}>Balance</p>
              <p className={styles.statValue}>{formatMoney(account.balanceMinor, account.currency)}</p>
            </div>
            {account.type === 'credit_card' && account.creditLimitMinor !== null && (
              <div>
                <p className={styles.statLabel}>Credit limit</p>
                <p className={styles.statValue}>
                  {formatMoney(account.creditLimitMinor, account.currency)}
                </p>
              </div>
            )}
          </div>
          <div className={styles.actions}>
            <DeleteButton
              label={account.name}
              onDelete={async () => {
                const result = await deleteAccount({ accountId: account.id });
                if (result.ok) onDeselect();
                return result;
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (selected.type === 'asset') {
    const asset = data.assets.find((a) => a.id === selected.id);
    if (!asset) return null;
    return (
      <div>
        <div className={styles.detailHeader}>
          <h2 className={styles.detailTitle}>{asset.name}</h2>
          <p className={styles.detailSubtitle}>
            {asset.type === 'physical' ? 'Physical asset' : 'Security'}
          </p>
        </div>
        <div className={styles.detailBody}>
          <div>
            <p className={styles.statLabel}>Value</p>
            <p className={styles.statValue}>{formatMoney(asset.valueMinor, asset.currency)}</p>
          </div>
          <div className={styles.actions}>
            <DeleteButton
              label={asset.name}
              onDelete={async () => {
                const result = await deleteAsset({ assetId: asset.id });
                if (result.ok) onDeselect();
                return result;
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (selected.type === 'deposit') {
    const deposit = data.deposits.find((d) => d.id === selected.id);
    if (!deposit) return null;
    return (
      <div>
        <div className={styles.detailHeader}>
          <h2 className={styles.detailTitle}>{deposit.name}</h2>
        </div>
        <div className={styles.detailBody}>
          <div>
            <p className={styles.statLabel}>Amount</p>
            <p className={styles.statValue}>{formatMoney(deposit.amountMinor, deposit.currency)}</p>
          </div>
          <div className={styles.actions}>
            <DeleteButton
              label={deposit.name}
              onDelete={async () => {
                const result = await deleteDeposit({ depositId: deposit.id });
                if (result.ok) onDeselect();
                return result;
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (selected.type === 'loan') {
    const loan = data.loans.find((l) => l.id === selected.id);
    if (!loan) return null;
    const paidOffPct =
      loan.principalMinor > 0
        ? ((loan.principalMinor - loan.remainingBalanceMinor) / loan.principalMinor) * 100
        : 0;
    return (
      <div>
        <div className={styles.detailHeader}>
          <h2 className={styles.detailTitle}>{loan.name}</h2>
          <p className={styles.detailSubtitle}>Lender: {loan.lender}</p>
        </div>
        <div className={styles.detailBody}>
          <div className={styles.statGrid}>
            <div>
              <p className={styles.statLabel}>Remaining balance</p>
              <p className={styles.statValue}>
                {formatMoney(loan.remainingBalanceMinor, loan.currency)}
              </p>
            </div>
            <div>
              <p className={styles.statLabel}>Monthly installment</p>
              <p className={styles.statValue}>
                {formatMoney(loan.installmentAmountMinor, loan.currency)}
              </p>
            </div>
            <div>
              <p className={styles.statLabel}>Started</p>
              <p className={styles.statValue}>{monthYear(loan.startDate)}</p>
            </div>
            <div>
              <p className={styles.statLabel}>Ends</p>
              <p className={styles.statValue}>{monthYear(loan.endDate)}</p>
            </div>
          </div>
          <div>
            <div className={styles.progressLabel}>
              <span>Paid off</span>
              <span>{Math.round(paidOffPct)}%</span>
            </div>
            <Progress value={paidOffPct} label={`${loan.name} paid off`} />
          </div>
          <p className={styles.linkedNote}>
            Installment payments are logged against the &quot;Loans&quot; fixed expense on the
            Budget page — use Add expense as normal.
          </p>
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => setEditingLoan(true)}>
              Edit loan
            </Button>
            <DeleteButton
              label={loan.name}
              onDelete={async () => {
                const result = await deleteLoan({ loanId: loan.id });
                if (result.ok) onDeselect();
                return result;
              }}
            />
          </div>
        </div>
        {editingLoan && <EditLoanDialog loan={loan} onClose={() => setEditingLoan(false)} />}
      </div>
    );
  }

  // selected.type === 'person'
  const person = data.people.find((p) => p.id === selected.id);
  if (!person) return null;
  return (
    <div>
      <div className={styles.detailHeader}>
        <h2 className={styles.detailTitle}>{person.name}</h2>
        <BalanceChip amountCents={person.balanceMinor} currency={person.currency} />
      </div>
      <div className={styles.detailBody}>
        <section>
          <p className={styles.statLabel}>History</p>
          {person.transactions.length === 0 ? (
            <p className={styles.emptyState}>Nothing recorded yet.</p>
          ) : (
            person.transactions.map((tx) => (
              <div key={tx.id} className={styles.transactionRow}>
                <span>
                  <span className={styles.transactionDate}>
                    {new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
                      new Date(tx.occurredAt),
                    )}
                  </span>{' '}
                  {tx.note && `• ${tx.note}`}
                </span>
                <span className={styles.transactionAmount}>
                  {formatMoney(tx.amountMinor, person.currency)}
                </span>
              </div>
            ))
          )}
        </section>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => setRecordingPersonTx(true)}>
            Record a transaction
          </Button>
          <DeleteButton
            label={person.name}
            onDelete={async () => {
              const result = await deletePerson({ personId: person.id });
              if (result.ok) onDeselect();
              return result;
            }}
          />
        </div>
      </div>
      {recordingPersonTx && (
        <RecordPersonTransactionDialog person={person} onClose={() => setRecordingPersonTx(false)} />
      )}
    </div>
  );
}
