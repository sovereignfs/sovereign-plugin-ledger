'use client';

import { useState } from 'react';
import { Icon } from '@sovereignfs/ui';
import { AddExpenseDialog } from './AddExpenseDialog';
import styles from './AddExpenseFab.module.css';

/**
 * mobile-fork.md's persistent "Add expense" entry point — a floating action
 * button rather than a header action (the desktop sidebar's pinned button
 * has no mobile equivalent once the sidebar itself is gone). Reuses the
 * exact same `AddExpenseDialog` the desktop sidebar opens; that component
 * forks to a `Drawer` on mobile internally (`useIsMobile`), so this FAB
 * doesn't need its own copy of the form.
 */
export function AddExpenseFab() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={styles.fab}
        aria-label="Add expense"
        onClick={() => setOpen(true)}
      >
        <Icon name="plus" size="lg" aria-hidden />
      </button>
      <AddExpenseDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
