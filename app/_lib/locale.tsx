'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { formatDay, formatMoney, formatMonthYear, formatPeriod } from './format';

/**
 * The request's locale, resolved once on the server from `Accept-Language`
 * (`request-locale.ts`) and threaded into every client tree through this
 * provider — so server render and client hydration format money and dates
 * with the same locale (see `format.ts`'s header for the mismatch this
 * prevents). `undefined` falls back to the runtime default on both sides.
 */
const LocaleContext = createContext<string | undefined>(undefined);

export function LedgerLocaleProvider({
  locale,
  children,
}: {
  locale: string | undefined;
  children: ReactNode;
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): string | undefined {
  return useContext(LocaleContext);
}

export interface Formatters {
  money: (amountMinor: number, currencyCode: string) => string;
  day: (timestampMs: number) => string;
  period: (year: number, month: number) => string;
  monthYear: (dateOnly: string) => string;
}

/** Locale-bound formatters for the current request — the one way components should format. */
export function useFormatters(): Formatters {
  const locale = useLocale();
  return useMemo(
    () => ({
      money: (amountMinor, currencyCode) => formatMoney(amountMinor, currencyCode, locale),
      day: (timestampMs) => formatDay(timestampMs, locale),
      period: (year, month) => formatPeriod(year, month, locale),
      monthYear: (dateOnly) => formatMonthYear(dateOnly, locale),
    }),
    [locale],
  );
}
