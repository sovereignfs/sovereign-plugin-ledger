'use client';

import { useState } from 'react';
import type { BudgetData, BudgetKind } from '../_lib/budget';
import { BudgetMain } from './BudgetMain';
import { CategoryDetail } from './CategoryDetail';
import { EditBudgetDialog } from './EditBudgetDialog';
import { LedgerShell } from './LedgerShell';

/**
 * Selection is client `useState`, not a route or parallel route (SPEC.md's
 * Routes section) — `data` is a plain prop from the server page, not frozen
 * into local state, so it reflects a fresh server render after any mutation
 * (see EditBudgetDialog's own doc comment on why that's safe here).
 */
export function BudgetView({ data }: { data: BudgetData }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<BudgetKind | null>(null);

  const selected = [...data.dynamic, ...data.fixed].find((c) => c.id === selectedId) ?? null;

  return (
    <>
      <LedgerShell
        detail={
          selected && <CategoryDetail category={selected} onEditBudget={(kind) => setEditing(kind)} />
        }
      >
        <BudgetMain data={data} selectedId={selectedId} onSelect={setSelectedId} />
      </LedgerShell>
      {editing && (
        <EditBudgetDialog
          kindId={editing.id}
          kindName={editing.name}
          currentAmountMinor={editing.predictedAmountMinor}
          currency={editing.currency}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
