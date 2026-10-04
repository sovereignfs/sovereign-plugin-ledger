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
const LAUNCHER_PLUGIN_ID = 'fs.sovereign.launcher';

/**
 * Platform chrome plugins — reached through chrome (the header's brand badge,
 * bell and avatar menu; this footer's own Apps button), never listed as app
 * tiles. The runtime keeps the same set in `runtime/src/launcher-plugins.ts`
 * as `CHROME_PLUGIN_IDS` and filters both its sidebar icons and its own Apps
 * drawer through it (SRS LCH-04, PLT-12), but `sdk.plugins.list()` applies no
 * such filter — it answers "what is installed and available to this user",
 * so a plugin reconstructing chrome has to apply this itself. Without it this
 * drawer listed Launcher, Account, Console and Inbox alongside real apps, and
 * Launcher twice over once the footer's own button started showing its icon.
 * Kept here rather than in `listMobileApps()` so that lookup stays the plain
 * availability list its callers (five pages, six views) expect, and so the
 * launcher's own entry is still visible to this component for the icon below.
 */
const CHROME_PLUGIN_IDS: ReadonlySet<string> = new Set([
  LAUNCHER_PLUGIN_ID,
  'fs.sovereign.account',
  'fs.sovereign.console',
  'fs.sovereign.inbox',
]);

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

  const launcher = apps.find((app) => app.id === LAUNCHER_PLUGIN_ID);
  const drawerApps = apps.filter((app) => !CHROME_PLUGIN_IDS.has(app.id));

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
          // The real Launcher icon, exactly as the platform's own MobileNav
          // supplies it (`launcherIconUrl={/plugin-icons/<id>.svg}`), so this
          // footer's middle button reads as the same Apps button everywhere
          // else in the instance. Left unset, MobileFooter falls back to a
          // generic `grid-2x2` glyph — which is what shipped here, and the
          // one slot in this bar that didn't match the rest of the platform.
          launcherIcon={
            launcher?.hasIcon ? (
              <img
                src={`/plugin-icons/${LAUNCHER_PLUGIN_ID}.svg`}
                alt=""
                aria-hidden
                className={styles.launcherIcon}
              />
            ) : undefined
          }
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
        items={drawerApps.map((app) => ({
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
