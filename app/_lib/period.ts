/**
 * Calendar-month boundaries, UTC — same convention as
 * `sovereign-plugin-tally.local`'s own `overview.ts` ("spent this month"
 * cutoff). Every dynamic kind's `predictedAmountMinor` is a monthly figure
 * (CONCEPT.md); fixed kinds carry their own recurrence fields but nothing
 * sets them yet (the setup wizard always leaves them null), so this task
 * treats every kind's period as a calendar month too — documented as a
 * known v1 simplification in SPEC.md's L.5 status entry, not silently
 * assumed.
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

/** True when `now`'s UTC calendar date is the 1st of the month — the
 *  month-end report job's (L.11) own gate, since the scheduler only offers
 *  a fixed interval, not a cron-style day-of-month trigger. */
export function isFirstOfMonthUtc(now: number = Date.now()): boolean {
  return new Date(now).getUTCDate() === 1;
}

/** The calendar month immediately before `now`'s UTC month — December of
 *  the prior year when `now` falls in January. */
export function getPreviousYearMonth(now: number = Date.now()): { year: number; month: number } {
  const { year, month } = getUtcYearMonth(now);
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}
