/**
 * Calendar-month boundaries, UTC — same convention as
 * `sovereign-plugin-tally.local`'s own `overview.ts` ("spent this month"
 * cutoff). Every dynamic kind's `predictedAmountMinor` is a monthly figure
 * (CONCEPT.md); fixed kinds carry their own recurrence fields but nothing
 * sets them yet (the setup wizard always leaves them null), so this task
 * treats every kind's period as a calendar month too — documented as a
 * known v1 simplification in SPEC.md's L.5 status entry, not silently
 * assumed.
 *
 * **Every user-chosen calendar day is stored as UTC noon of that day**
 * (`utcNoonOf`), never local midnight: a local-midnight instant for "Sep 1"
 * in any timezone east of UTC is still Aug 31 in UTC and would land in the
 * wrong month's budget and report. UTC noon of the chosen day reads back as
 * that same day in every timezone from UTC-11 to UTC+12, and always falls
 * inside the UTC month the user meant.
 */
export interface MonthRange {
  /** Inclusive, Unix ms. */
  start: number;
  /** Exclusive, Unix ms. */
  end: number;
}

/** `month` is 1-indexed (January = 1), matching `ledger_period_reviews.month`. */
export function getMonthRange(year: number, month: number): MonthRange {
  const start = Date.UTC(year, month - 1, 1);
  const end = Date.UTC(year, month, 1);
  return { start, end };
}

export function getCurrentMonthRange(now: number = Date.now()): MonthRange {
  const { year, month } = getUtcYearMonth(now);
  return getMonthRange(year, month);
}

/** 1-indexed `month`, UTC calendar — the same period key `ledger_period_reviews` uses. */
export function getUtcYearMonth(timestampMs: number): { year: number; month: number } {
  const d = new Date(timestampMs);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/** `YYYY-MM-DD`, UTC — the date-only shape `getRateAsOf` expects. */
export function todayDateOnly(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` (UTC) of an `occurred_at` instant — the FX pricing date for a historical amount. */
export function dateOnlyOf(timestampMs: number): string {
  return todayDateOnly(timestampMs);
}

/**
 * UTC noon of the calendar day a local `Date` falls on — the instant every
 * user-picked day is stored as (see this file's header). Takes the local
 * year/month/day, deliberately not `.toISOString()`, for the same reason
 * `format.ts`'s `toDateOnly` does.
 */
export function utcNoonOf(localDate: Date): number {
  return Date.UTC(localDate.getFullYear(), localDate.getMonth(), localDate.getDate(), 12);
}

/** The calendar month immediately before `now`'s UTC month — December of
 *  the prior year when `now` falls in January. */
export function getPreviousYearMonth(now: number = Date.now()): { year: number; month: number } {
  const { year, month } = getUtcYearMonth(now);
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** True when `(year, month)` is `now`'s own UTC calendar month — still accumulating, not closed. */
export function isCurrentMonth(year: number, month: number, now: number = Date.now()): boolean {
  const current = getUtcYearMonth(now);
  return current.year === year && current.month === month;
}
