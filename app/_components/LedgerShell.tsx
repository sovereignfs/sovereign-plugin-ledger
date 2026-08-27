import type { ReactNode } from 'react';
import { ThreeColumnLayout } from '@sovereignfs/ui';
import { LedgerSidebar } from './LedgerSidebar';

/**
 * The persistent sidebar + main (+ optional detail) shell for every
 * post-setup Ledger screen — same `ThreeColumnLayout` proportions
 * `sovereign-plugin-tally.local` uses (web-shell.md's Direction section).
 *
 * Composed directly by each page rather than via a Next.js route-group
 * `layout.tsx` (the pattern Tally itself uses): `/ledger`'s root route is
 * sometimes this shell (setup complete) and sometimes a full-bleed wizard
 * with no shell at all (setup incomplete), which a single nested layout
 * can't express — see page.tsx's own doc comment. Budget's detail column
 * is client `useState`, not a parallel route (SPEC.md's Routes section), so
 * `detail` is a plain optional prop here rather than a second named slot.
 */
export function LedgerShell({ children, detail }: { children: ReactNode; detail?: ReactNode }) {
  return (
    <ThreeColumnLayout sidebarWidth={240}>
      <LedgerSidebar />
      {children}
      {detail}
    </ThreeColumnLayout>
  );
}
