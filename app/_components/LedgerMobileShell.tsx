'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Icon, MobileAppsDrawer, MobileFooter } from '@sovereignfs/ui';
import type { MobileAppEntry } from '../_lib/apps';
import { AddExpenseFab } from './AddExpenseFab';
import styles from './LedgerMobileShell.module.css';

/**
 * mobile-fork.md's mobile tree — the `ResponsiveSurface` counterpart to
 * `LedgerShell` (the desktop `ThreeColumnLayout` wrapper), composed the
 * same way: each page's own View component picks one or the other, neither
 * behind a Next.js route-group `layout.tsx` (see `LedgerShell`'s own doc
 * comment for why).
 *
 * `shellConfig.mobileFooter: false` (manifest.json) removes the platform's
 * own `MobileNav` — and the real Apps drawer it opens — from every route
 * under this plugin; `MobileFooter`/`MobileAppsDrawer` here are the same
 * published `@sovereignfs/ui` components the platform's own chrome uses,
 * just consumer-instantiated with this plugin's own four destinations and
 * `sdk.plugins.list()`-sourced app data (`listMobileApps`, `app/_lib/apps.ts`)
 * — mirroring `sovereign-plugin-tally.local`'s own `TallyMobileShell`
 * (same `shell: default` situation) down to the drawer using plain `href`
 * navigation (a full page load, correct for crossing plugin boundaries)
 * rather than the footer's own `onClick`+`router.push` (client-side, correct
 * for navigating within this plugin's own four sections).
 *
 * `shellConfig.mobileHeader` is deliberately left at its default (`true`)
 * — the platform's real header, with a real working notification bell and
 * account menu, keeps rendering. `mobile-fork.md`'s wireframe calls for a
 * self-rendered header too (for a per-screen title), but `NotificationBell`/
 * `AccountMenu` have no `@sovereignfs/ui` equivalent to reuse (unlike
 * `MobileAppsDrawer`, confirmed in the package's own published exports) —
 * replacing the header would mean rebuilding a full notification center and
 * account menu from SDK primitives from scratch, exactly what
 * `sovereign-plugin-kanban.local`'s `shell: minimal` build had to do for the
 * same reason. That's a real, substantial side-build with no connection to
 * Ledger's own purpose, for a "per-screen title" that plain in-content text
 * delivers at negligible cost — each mobile screen below renders its own
 * short heading instead. See SPEC.md's L.9 status entry for the full
 * account of this trade-off.
 */
export function LedgerMobileShell({
  apps,
  children,
}: {
  apps: MobileAppEntry[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [appsOpen, setAppsOpen] = useState(false);

  const isOverview = pathname === '/ledger';
  const isBudget = pathname.startsWith('/ledger/budget');
  const isAccounts = pathname.startsWith('/ledger/accounts');
  const isReports = pathname.startsWith('/ledger/reports');

  return (
    <>
      <div className={styles.content}>{children}</div>
      <AddExpenseFab />
      <div className={styles.footerFixed}>
        <MobileFooter
          onOpenApps={() => setAppsOpen(true)}
          launcherOpen={appsOpen}
          leftIcons={[
            {
              icon: <Icon name="layout-dashboard" size="md" aria-hidden />,
              label: 'Overview',
              active: isOverview,
              onClick: () => router.push('/ledger'),
            },
            {
              icon: <Icon name="list" size="md" aria-hidden />,
              label: 'Budget',
              active: isBudget,
              onClick: () => router.push('/ledger/budget'),
            },
          ]}
          rightIcons={[
            {
              icon: <Icon name="table" size="md" aria-hidden />,
              label: 'Accounts',
              active: isAccounts,
              onClick: () => router.push('/ledger/accounts'),
            },
            {
              icon: <Icon name="file-text" size="md" aria-hidden />,
              label: 'Reports',
              active: isReports,
              onClick: () => router.push('/ledger/reports'),
            },
          ]}
        />
      </div>
      <MobileAppsDrawer
        open={appsOpen}
        onClose={() => setAppsOpen(false)}
        aria-label="Apps"
        items={apps.map((app) => ({
          key: app.id,
          label: app.name,
          icon: app.hasIcon ? (
            <img src={`/plugin-icons/${app.id}.svg`} alt="" className={styles.drawerIcon} />
          ) : (
            <Icon name="grid-2x2" size="lg" aria-hidden />
          ),
          href: app.routePrefix,
        }))}
      />
    </>
  );
}
