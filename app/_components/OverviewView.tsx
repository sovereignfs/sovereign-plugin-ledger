'use client';

import { ResponsiveSurface } from '@sovereignfs/ui';
import type { MobileAppEntry } from '../_lib/apps';
import { LedgerLocaleProvider } from '../_lib/locale';
import type { OverviewData } from '../_lib/overview';
import { LedgerMobileShell } from './LedgerMobileShell';
import { LedgerShell } from './LedgerShell';
import { MobileOverviewScreen } from './MobileOverviewScreen';
import { OverviewChecklist } from './OverviewChecklist';
import { OverviewDashboard } from './OverviewDashboard';

/**
 * web-shell.md's two Overview states, forked into `ResponsiveSurface`'s
 * web/mobile trees (L.9) — same `data`, two presentations. The checklist-
 * vs-dashboard decision itself doesn't fork: a fresh account reads as
 * "fresh" on both breakpoints.
 *
 * The signal for "using the budget for real" is: has the user logged at
 * least one expense — matching the wireframe's own spirit (its literal
 * "until enough of the budget is filled in... or dismissed" has no
 * persisted dismiss action behind it).
 */
export function OverviewView({
  data,
  apps,
  insights,
  locale,
}: {
  data: OverviewData;
  apps: MobileAppEntry[];
  insights: string[];
  locale: string | undefined;
}) {
  const desktopContent =
    data.transactionCount === 0 ? (
      <OverviewChecklist items={data.checklist} />
    ) : (
      <OverviewDashboard data={data} insights={insights} />
    );

  return (
    <LedgerLocaleProvider locale={locale}>
      <ResponsiveSurface
        web={<LedgerShell>{desktopContent}</LedgerShell>}
        mobile={
          <LedgerMobileShell apps={apps}>
            <MobileOverviewScreen data={data} insights={insights} />
          </LedgerMobileShell>
        }
      />
    </LedgerLocaleProvider>
  );
}
