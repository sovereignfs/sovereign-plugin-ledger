'use client';

import { useState } from 'react';
import type { PeriodReport, ReportsData } from '../_lib/reports';
import { LedgerShell } from './LedgerShell';
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
 */
export function ReportsView({ data }: { data: ReportsData }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(
    data.periods[0] ? periodKeyOf(data.periods[0]) : null,
  );

  const selected = data.periods.find((p) => periodKeyOf(p) === selectedKey) ?? null;

  return (
    <LedgerShell
      detail={
        selected && (
          <ReportsDetail
            key={selectedKey}
            period={selected}
            baseCurrencyCode={data.baseCurrencyCode}
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
  );
}
