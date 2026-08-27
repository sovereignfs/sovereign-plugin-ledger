export function formatMoney(amountMinor: number, currencyCode: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(
    amountMinor / 100,
  );
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
