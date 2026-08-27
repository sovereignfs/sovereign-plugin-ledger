'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Button, Icon } from '@sovereignfs/ui';
import type { IconName } from '@sovereignfs/ui';
import { AddExpenseDialog } from './AddExpenseDialog';
import styles from './LedgerSidebar.module.css';

const NAV: Array<{ href: string; label: string; icon: IconName }> = [
  { href: '/ledger', label: 'Overview', icon: 'layout-dashboard' },
  { href: '/ledger/budget', label: 'Budget', icon: 'list' },
];

/**
 * Rows for sections with no shipped page yet — rendered as disabled, not as
 * `<Link>`s to a route that would 404 (sv-ui-design's "no dead nav" rule).
 * Accounts/Reports become real nav items at L.7/L.8; Settings has no task
 * assigned yet at all.
 */
const COMING_SOON: Array<{ label: string; icon: IconName }> = [
  { label: 'Accounts', icon: 'table' },
  { label: 'Reports', icon: 'file-text' },
];

/**
 * Persistent secondary nav — same precedent as Tally's/Kanban's own
 * `TallySidebar`/`KanbanSidebar`, composed directly into `LedgerShell`
 * rather than a route-group layout (see that component's own doc comment).
 * "+ Add expense" is pinned above the nav list per web-shell.md's Direction
 * (an overlay trigger, not a nav item) — opens `AddExpenseDialog`, built in
 * L.6.
 */
export function LedgerSidebar() {
  const pathname = usePathname();
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);

  function isActive(href: string): boolean {
    return href === '/ledger' ? pathname === '/ledger' : pathname.startsWith(href);
  }

  return (
    <nav className={styles.nav} aria-label="Ledger sections">
      <Button className={styles.addExpense} onClick={() => setAddExpenseOpen(true)}>
        <Icon name="plus" size="sm" aria-hidden />
        Add expense
      </Button>
      <AddExpenseDialog open={addExpenseOpen} onClose={() => setAddExpenseOpen(false)} />

      <div className={styles.divider} />

      <div className={styles.group}>
        {NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[styles.link, active ? styles.linkActive : ''].filter(Boolean).join(' ')}
              aria-current={active ? 'page' : undefined}
            >
              <Icon name={item.icon} size="sm" aria-hidden />
              {item.label}
            </Link>
          );
        })}
        {COMING_SOON.map((item) => (
          <div key={item.label} className={styles.linkDisabled} title="Coming in a future update">
            <Icon name={item.icon} size="sm" aria-hidden />
            {item.label}
            <span className={styles.soon}>Soon</span>
          </div>
        ))}
      </div>

      <div className={styles.spacer} />

      <div className={styles.divider} />
      <div className={styles.linkDisabled} title="Coming in a future update">
        <Icon name="settings" size="sm" aria-hidden />
        Settings
        <span className={styles.soon}>Soon</span>
      </div>
    </nav>
  );
}
