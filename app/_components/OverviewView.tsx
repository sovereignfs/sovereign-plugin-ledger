'use client';

import { ResponsiveSurface } from '@sovereignfs/ui';
import type { MobileAppEntry } from '../_lib/apps';
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
 * The wireframe's own trigger condition ("until enough of the budget is
 * filled in... or dismissed") can't be reached literally yet — every
 * "beyond minimum" checklist section (accounts, saving jars, ...) has no
 * task shipped, so nothing can ever populate them, and this task doesn't
 * add a persisted dismiss action (not asked for, and inventing one now
 * would be scope creep for a screen this phase of the build can't
 * otherwise reach anyway). The signal used instead — has the user logged
 * at least one expense — is reachable today (the DB/actions layer accepts
 * transactions since L.3, even though L.6's dialog hasn't shipped) and
 * matches the wireframe's own spirit: tracking expenses is what "using the
 * budget for real" means here.
 */
export function OverviewView({
  data,
  apps,
  insights,
}: {
  data: OverviewData;
  apps: MobileAppEntry[];
  insights: string[];
}) {
  const desktopContent =
    data.transactionCount === 0 ? (
      <OverviewChecklist items={data.checklist} />
    ) : (
      <OverviewDashboard data={data} insights={insights} />
    );

  return (
    <ResponsiveSurface
      web={<LedgerShell>{desktopContent}</LedgerShell>}
      mobile={
        <LedgerMobileShell apps={apps}>
          <MobileOverviewScreen data={data} insights={insights} />
        </LedgerMobileShell>
      }
    />
  );
}
