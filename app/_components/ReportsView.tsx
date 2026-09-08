'use client';

import { useState } from 'react';
import { ResponsiveSurface } from '@sovereignfs/ui';
import type { MobileAppEntry } from '../_lib/apps';
import { LedgerLocaleProvider } from '../_lib/locale';
import type { PeriodReport, ReportsData } from '../_lib/reports';
import { LedgerMobileShell } from './LedgerMobileShell';
import { LedgerShell } from './LedgerShell';
import { MobileReportsScreen } from './MobileReportsScreen';
import { ReportsDetail } from './ReportsDetail';
import { ReportsMain } from './ReportsMain';

function periodKeyOf(period: PeriodReport): string {
  return `${period.year}-${period.month}`;
}

/**
 * Desktop defaults the detail column to the most recent period (periods
 * are already sorted most-recent-first by `getReportsData`) — a Reports
 * page with an empty detail column on first load would make the screen's
 * main content invisible until the user clicks something. Mobile does NOT
 * inherit that default: the drill-down stack opens on the period list, and
 * only an explicit tap opens a period (an earlier version landed straight
 * in the latest month's detail, leaving the list reachable only via Back).
 * `selectedKey` therefore tracks the user's own choice; the desktop default
 * is applied at render time.
 */
export function ReportsView({
  data,
  apps,
  insights,
  locale,
}: {
  data: ReportsData;
  apps: MobileAppEntry[];
  insights: string[];
  locale: string | undefined;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const explicit = data.periods.find((p) => periodKeyOf(p) === selectedKey) ?? null;
  const desktopSelected = explicit ?? data.periods[0] ?? null;
  const desktopKey = desktopSelected ? periodKeyOf(desktopSelected) : null;

  return (
    <LedgerLocaleProvider locale={locale}>
      <ResponsiveSurface
        web={
          <LedgerShell
            detail={
              desktopSelected && (
                <ReportsDetail
                  key={desktopKey}
                  period={desktopSelected}
                  baseCurrencyCode={data.baseCurrencyCode}
                  insights={insights}
                />
              )
            }
          >
            <ReportsMain
              data={data}
              selectedKey={desktopKey}
              onSelect={(period) => setSelectedKey(periodKeyOf(period))}
            />
          </LedgerShell>
        }
        mobile={
          <LedgerMobileShell apps={apps}>
            <MobileReportsScreen
              data={data}
              selected={explicit}
              insights={insights}
              onSelect={(period) => setSelectedKey(periodKeyOf(period))}
              onBack={() => setSelectedKey(null)}
            />
          </LedgerMobileShell>
        }
      />
    </LedgerLocaleProvider>
  );
}
