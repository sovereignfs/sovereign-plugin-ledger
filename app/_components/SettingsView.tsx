'use client';

import { useState } from 'react';
import { ResponsiveSurface } from '@sovereignfs/ui';
import type { MobileAppEntry } from '../_lib/apps';
import type { SettingsData } from '../_lib/settings';
import { CreateCategoryDialog } from './CreateCategoryDialog';
import { CreateCurrencyDialog } from './CreateCurrencyDialog';
import { CreateIncomeDialog } from './CreateIncomeDialog';
import { CreateKindDialog } from './CreateKindDialog';
import { EditIncomeDialog } from './EditIncomeDialog';
import { LedgerMobileShell } from './LedgerMobileShell';
import { LedgerShell } from './LedgerShell';
import { MobileSettingsScreen } from './MobileSettingsScreen';
import { SettingsDetail } from './SettingsDetail';
import { SettingsMain } from './SettingsMain';

type OpenDialog = 'currency' | 'income' | 'category' | null;

/**
 * Only Categories gets a select→detail promotion (matching `AccountsView`'s
 * pattern) — Currencies/Incomes are short, flat lists where inline row
 * actions in `SettingsMain` are enough, so they need no selection state
 * here at all.
 */
export function SettingsView({ data, apps }: { data: SettingsData; apps: MobileAppEntry[] }) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
  const [editingIncomeId, setEditingIncomeId] = useState<string | null>(null);
  const [addKindTarget, setAddKindTarget] = useState<{ categoryId: string; currency: string } | null>(
    null,
  );

  const editingIncome = data.incomes.find((i) => i.id === editingIncomeId) ?? null;

  const dialogs = (
    <>
      <CreateCurrencyDialog
        open={openDialog === 'currency'}
        onClose={() => setOpenDialog(null)}
        existingCodes={data.currencies.map((c) => c.code)}
      />
      <CreateIncomeDialog
        open={openDialog === 'income'}
        onClose={() => setOpenDialog(null)}
        baseCurrencyCode={data.baseCurrencyCode}
      />
      <CreateCategoryDialog
        open={openDialog === 'category'}
        onClose={() => setOpenDialog(null)}
        baseCurrencyCode={data.baseCurrencyCode}
      />
      {editingIncome && (
        <EditIncomeDialog
          open
          onClose={() => setEditingIncomeId(null)}
          incomeId={editingIncome.id}
          currentLabel={editingIncome.label}
          currentAmountMinor={editingIncome.amountMinor}
          currency={editingIncome.currency}
        />
      )}
      {addKindTarget && (
        <CreateKindDialog
          open
          onClose={() => setAddKindTarget(null)}
          categoryId={addKindTarget.categoryId}
          categoryCurrency={addKindTarget.currency}
        />
      )}
    </>
  );

  const main = (
    <SettingsMain
      data={data}
      selectedCategoryId={selectedCategoryId}
      onSelectCategory={setSelectedCategoryId}
      onAddCurrency={() => setOpenDialog('currency')}
      onAddIncome={() => setOpenDialog('income')}
      onEditIncome={setEditingIncomeId}
      onAddCategory={() => setOpenDialog('category')}
    />
  );

  return (
    <ResponsiveSurface
      web={
        <>
          <LedgerShell
            detail={
              selectedCategoryId && (
                <SettingsDetail
                  key={selectedCategoryId}
                  data={data}
                  categoryId={selectedCategoryId}
                  onDeselect={() => setSelectedCategoryId(null)}
                  onAddKind={(categoryId, currency) => setAddKindTarget({ categoryId, currency })}
                />
              )
            }
          >
            {main}
          </LedgerShell>
          {dialogs}
        </>
      }
      mobile={
        <LedgerMobileShell apps={apps}>
          <MobileSettingsScreen
            data={data}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={setSelectedCategoryId}
            onBack={() => setSelectedCategoryId(null)}
            onAddCurrency={() => setOpenDialog('currency')}
            onAddIncome={() => setOpenDialog('income')}
            onEditIncome={setEditingIncomeId}
            onAddCategory={() => setOpenDialog('category')}
            onAddKind={(categoryId, currency) => setAddKindTarget({ categoryId, currency })}
          />
          {dialogs}
        </LedgerMobileShell>
      }
    />
  );
}
