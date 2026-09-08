'use client';

import { useState } from 'react';
import { ResponsiveSurface } from '@sovereignfs/ui';
import type { MobileAppEntry } from '../_lib/apps';
import type { BudgetData, BudgetKind, BudgetTransaction } from '../_lib/budget';
import { LedgerLocaleProvider } from '../_lib/locale';
import { BudgetMain } from './BudgetMain';
import { CategoryDetail } from './CategoryDetail';
import { CreateSavingJarDialog } from './CreateSavingJarDialog';
import { EditBudgetDialog } from './EditBudgetDialog';
import { EditTransactionDialog } from './EditTransactionDialog';
import { LedgerMobileShell } from './LedgerMobileShell';
import { LedgerShell } from './LedgerShell';
import { MobileBudgetScreen } from './MobileBudgetScreen';
import { SavingJarDetail } from './SavingJarDetail';

/**
 * Selection is client `useState`, not a route or parallel route (SPEC.md's
 * Routes section) — `data` is a plain prop from the server page, not frozen
 * into local state, so it reflects a fresh server render after any mutation
 * (see EditBudgetDialog's own doc comment on why that's safe here). The same
 * `selectedId`/`editing` state drives both the desktop detail column and the
 * mobile drill-down screen (`MobileBudgetScreen`, mobile-fork.md screens
 * 2-3) — only the presentation forks, not the selection model.
 *
 * `selectedId` is looked up across all three lists (L.12 adds `saving`
 * alongside `dynamic`/`fixed`) — a `BudgetSavingCategory` doesn't fit
 * `CategoryDetail`'s prop type at all, so `SavingJarDetail` is a distinct
 * detail component picked by which list actually matched.
 */
export function BudgetView({
  data,
  apps,
  locale,
}: {
  data: BudgetData;
  apps: MobileAppEntry[];
  locale: string | undefined;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<BudgetKind | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<BudgetTransaction | null>(null);
  const [addingSavingJar, setAddingSavingJar] = useState(false);

  const selected = [...data.dynamic, ...data.fixed].find((c) => c.id === selectedId) ?? null;
  const selectedSaving = data.saving.find((c) => c.id === selectedId) ?? null;

  const detail = selected ? (
    <CategoryDetail
      category={selected}
      onEditBudget={(kind) => setEditing(kind)}
      onEditTransaction={(tx) => setEditingTransaction(tx)}
    />
  ) : selectedSaving ? (
    <SavingJarDetail
      category={selectedSaving}
      onEditTarget={(kind) => setEditing(kind)}
      onDeleted={() => setSelectedId(null)}
    />
  ) : null;

  const dialogs = (
    <>
      {editing && (
        <EditBudgetDialog
          kindId={editing.id}
          kindName={editing.name}
          currentAmountMinor={editing.predictedAmountMinor}
          currency={editing.currency}
          onClose={() => setEditing(null)}
        />
      )}
      {editingTransaction && (
        <EditTransactionDialog
          transaction={editingTransaction}
          onClose={() => setEditingTransaction(null)}
        />
      )}
      <CreateSavingJarDialog
        open={addingSavingJar}
        onClose={() => setAddingSavingJar(false)}
        baseCurrencyCode={data.baseCurrencyCode}
      />
    </>
  );

  return (
    <LedgerLocaleProvider locale={locale}>
      <ResponsiveSurface
        web={
          <>
            <LedgerShell detail={detail}>
              <BudgetMain
                data={data}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onAddSavingJar={() => setAddingSavingJar(true)}
              />
            </LedgerShell>
            {dialogs}
          </>
        }
        mobile={
          <LedgerMobileShell apps={apps}>
            <MobileBudgetScreen
              data={data}
              selected={selected}
              selectedSaving={selectedSaving}
              onSelect={setSelectedId}
              onBack={() => setSelectedId(null)}
              onEditBudget={setEditing}
              onEditTransaction={setEditingTransaction}
              onAddSavingJar={() => setAddingSavingJar(true)}
            />
            {dialogs}
          </LedgerMobileShell>
        }
      />
    </LedgerLocaleProvider>
  );
}
