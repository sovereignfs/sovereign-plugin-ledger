/**
 * Every formatter takes an explicit `locale` — `undefined` means "the
 * runtime's default", which differs between the server (Node's ICU
 * default, usually en-US) and the browser. A client component that formats
 * during SSR with one locale and re-formats on the client with another
 * produces a hydration text mismatch, so components read the request's
 * locale from `LedgerLocaleProvider` (`locale.tsx`) and pass it here; only
 * genuinely server-only code (the month-end recap job) formats with a
 * fixed locale of its own.
 */
import { currencyDecimals } from './currency-options';

export function formatMoney(amountMinor: number, currencyCode: string, locale?: string): string {
  const decimals = currencyDecimals(currencyCode);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    // Stated explicitly rather than left to ICU's own default for the code.
    // For the ISO set the two agree, so nothing moves; for BTC they do not —
    // BTC is not ISO 4217, ICU has no entry for it, and its fallback is two
    // digits, which would render every amount below 0.01 BTC as "BTC 0.00".
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amountMinor / 10 ** decimals);
}

/**
 * "Sep 14" for an `occurred_at` instant. Rendered in UTC, not the viewer's
 * zone: every user-chosen day is stored as UTC noon of that day
 * (`period.ts`), so UTC is the one zone guaranteed to read it back as the
 * day the user picked.
 */
export function formatDay(timestampMs: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(timestampMs));
}

/** "September 2026" for a 1-indexed `(year, month)` period key. */
export function formatPeriod(year: number, month: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/** "Sep 2026" for a `YYYY-MM-DD` date-only string (loan start/end). */
export function formatMonthYear(dateOnly: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(
    fromDateOnly(dateOnly),
  );
}

/** Strict `YYYY-MM-DD` shape check for a date-only field arriving from a client. */
export function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * `Date` <-> `YYYY-MM-DD` conversions for date-only fields (loan
 * start/end dates), using the browser's LOCAL calendar date on both ends —
 * never `.toISOString()`/`Date.UTC` for this. A `DatePicker` produces a
 * `Date` at local midnight for whatever day the user clicked; converting
 * that through UTC (`.toISOString().slice(0, 10)`) silently shifts the
 * date by a day for any non-zero UTC offset whose sign disagrees with the
 * shift direction — reproduced live in Europe/Berlin (UTC+2): picking
 * "Oct 15" round-tripped to "Oct 14" the moment it was re-parsed with
 * `new Date(\`${str}T00:00:00Z\`)` and read back via local getters.
 */
export function toDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function fromDateOnly(dateOnly: string): Date {
  const parts = dateOnly.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  return new Date(year, month - 1, day);
}

/** The local `Date` (at local midnight) for an `occurred_at` stored as UTC noon — the DatePicker's input shape. */
export function fromOccurredAt(timestampMs: number): Date {
  const d = new Date(timestampMs);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
