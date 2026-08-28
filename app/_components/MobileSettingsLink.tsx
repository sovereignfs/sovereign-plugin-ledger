'use client';

import Link from 'next/link';
import { Icon, useIsMobile } from '@sovereignfs/ui';
import styles from './MobileSettingsLink.module.css';

/**
 * Settings entry point for the 4 mobile drill-down screens (Overview,
 * Budget, Accounts, Reports) — `LedgerMobileShell`'s self-rendered footer
 * already uses its full 5-icon capacity (Overview/Budget left,
 * Accounts/Reports right, around the fixed Apps launcher), so there's no
 * footer slot left for a 6th destination. Renders nothing on desktop (the
 * sidebar's own real `Settings` link covers that). Ports
 * `sovereign-plugin-tally.local`'s own `MobileSettingsLink` — the exact
 * same footer-capacity constraint, solved the same way there.
 */
export function MobileSettingsLink() {
  const isMobile = useIsMobile();
  if (!isMobile) return null;

  return (
    <Link href="/ledger/settings" aria-label="Settings" className={styles.link}>
      <Icon name="settings" size="md" aria-hidden />
    </Link>
  );
}
