'use client';

import { useState } from 'react';
import { ResponsiveSurface } from '@sovereignfs/ui';
import type { MobileAppEntry } from '../_lib/apps';
import type { AccountsData } from '../_lib/accounts';
import { AccountsDetail } from './AccountsDetail';
import { AccountsMain } from './AccountsMain';
import { CreateAccountDialog } from './CreateAccountDialog';
import { CreateAssetDialog } from './CreateAssetDialog';
import { CreateDepositDialog } from './CreateDepositDialog';
import { CreateLoanDialog } from './CreateLoanDialog';
import { CreatePersonDialog } from './CreatePersonDialog';
import { LedgerMobileShell } from './LedgerMobileShell';
import { LedgerShell } from './LedgerShell';
import { MobileAccountsScreen } from './MobileAccountsScreen';

export type SelectedItemType = 'account' | 'asset' | 'deposit' | 'loan' | 'person';
export type SelectedItem = { type: SelectedItemType; id: string } | null;

type OpenDialog = 'account' | 'asset' | 'deposit' | 'loan' | 'person' | null;

/**
 * web-shell.md screen 4 — one unified net-worth list+detail, selection as
 * client `useState` (SPEC.md's Routes section), same pattern as Budget's
 * `BudgetView`. `data` is a plain prop, not frozen — a fresh server render
 * after any mutation just flows new props into this already-mounted tree.
 * The same `selected`/`openDialog` state drives both the desktop list+detail
 * columns and the mobile drill-down screen (`MobileAccountsScreen`,
 * mobile-fork.md screens 4-5) — only the presentation forks.
 */
export function AccountsView({ data, apps }: { data: AccountsData; apps: MobileAppEntry[] }) {
  const [selected, setSelected] = useState<SelectedItem>(null);
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);

  const dialogs = (
    <>
      <CreateAccountDialog open={openDialog === 'account'} onClose={() => setOpenDialog(null)} />
      <CreateAssetDialog open={openDialog === 'asset'} onClose={() => setOpenDialog(null)} />
      <CreateDepositDialog open={openDialog === 'deposit'} onClose={() => setOpenDialog(null)} />
      <CreateLoanDialog open={openDialog === 'loan'} onClose={() => setOpenDialog(null)} />
      <CreatePersonDialog open={openDialog === 'person'} onClose={() => setOpenDialog(null)} />
    </>
  );

  return (
    <ResponsiveSurface
      web={
        <>
          <LedgerShell
            detail={
              selected && (
                <AccountsDetail
                  key={`${selected.type}:${selected.id}`}
                  data={data}
                  selected={selected}
                  onDeselect={() => setSelected(null)}
                />
              )
            }
          >
            <AccountsMain
              data={data}
              selected={selected}
              onSelect={setSelected}
              onAddAccount={() => setOpenDialog('account')}
              onAddAsset={() => setOpenDialog('asset')}
              onAddDeposit={() => setOpenDialog('deposit')}
              onAddLoan={() => setOpenDialog('loan')}
              onAddPerson={() => setOpenDialog('person')}
            />
          </LedgerShell>
          {dialogs}
        </>
      }
      mobile={
        <LedgerMobileShell apps={apps}>
          <MobileAccountsScreen
            data={data}
            selected={selected}
            onSelect={setSelected}
            onBack={() => setSelected(null)}
            onAddAccount={() => setOpenDialog('account')}
            onAddAsset={() => setOpenDialog('asset')}
            onAddDeposit={() => setOpenDialog('deposit')}
            onAddLoan={() => setOpenDialog('loan')}
            onAddPerson={() => setOpenDialog('person')}
          />
          {dialogs}
        </LedgerMobileShell>
      }
    />
  );
}
