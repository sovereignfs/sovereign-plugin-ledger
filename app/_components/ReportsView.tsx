'use client';

import { useState } from 'react';
import { ResponsiveSurface } from '@sovereignfs/ui';
import type { MobileAppEntry } from '../_lib/apps';
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
 * Selection defaults to the most recent period (periods are already sorted
 * most-recent-first by `getReportsData`) rather than starting with nothing
 * selected — a Reports page with an empty detail column on first load would
 * make the screen's main content invisible until the user clicks something.
 * On mobile that same default instead opens straight into the most recent
 * period's drill-down screen — `MobileReportsScreen`'s own back button
 * returns to the period list, matching mobile-fork.md screens 6-7.
 */
export function ReportsView({
  data,
  apps,
  insights,
}: {
  data: ReportsData;
  apps: MobileAppEntry[];
  insights: string[];
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(
    data.periods[0] ? periodKeyOf(data.periods[0]) : null,
  );

  const selected = data.periods.find((p) => periodKeyOf(p) === selectedKey) ?? null;

  return (
    <ResponsiveSurface
      web={
        <LedgerShell
          detail={
            selected && (
              <ReportsDetail
                key={selectedKey}
                period={selected}
                baseCurrencyCode={data.baseCurrencyCode}
                insights={insights}
              />
            )
          }
        >
          <ReportsMain
            data={data}
            selectedKey={selectedKey}
            onSelect={(period) => setSelectedKey(periodKeyOf(period))}
          />
        </LedgerShell>
      }
      mobile={
        <LedgerMobileShell apps={apps}>
          <MobileReportsScreen
            data={data}
            selected={selected}
            insights={insights}
            onSelect={(period) => setSelectedKey(periodKeyOf(period))}
            onBack={() => setSelectedKey(null)}
          />
        </LedgerMobileShell>
      }
    />
  );
}
