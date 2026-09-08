import { describe, expect, it } from 'vitest';
import {
  getCurrentMonthRange,
  getPreviousYearMonth,
  isCurrentMonth,
  todayDateOnly,
  utcNoonOf,
} from '../period';

describe('getCurrentMonthRange', () => {
  it('returns the UTC calendar-month boundaries for the given instant', () => {
    // 2026-08-27T15:00:00Z — mid-month, mid-day.
    const now = Date.UTC(2026, 7, 27, 15, 0, 0);
    const { start, end } = getCurrentMonthRange(now);
    expect(start).toBe(Date.UTC(2026, 7, 1, 0, 0, 0));
    expect(end).toBe(Date.UTC(2026, 8, 1, 0, 0, 0));
  });

  it('rolls over correctly across a year boundary', () => {
    const now = Date.UTC(2026, 11, 15); // December
    const { start, end } = getCurrentMonthRange(now);
    expect(start).toBe(Date.UTC(2026, 11, 1));
    expect(end).toBe(Date.UTC(2027, 0, 1));
  });

  it('start is inclusive and end is exclusive of an instant exactly on the boundary', () => {
    const startOfMonth = Date.UTC(2026, 7, 1, 0, 0, 0);
    const { start, end } = getCurrentMonthRange(startOfMonth);
    expect(start).toBeLessThanOrEqual(startOfMonth);
    expect(end).toBeGreaterThan(startOfMonth);
  });
});

describe('todayDateOnly', () => {
  it('formats a UTC instant as YYYY-MM-DD', () => {
    expect(todayDateOnly(Date.UTC(2026, 7, 27, 23, 59, 59))).toBe('2026-08-27');
  });
});

describe('isCurrentMonth', () => {
  it('matches only the UTC month of `now`', () => {
    const now = Date.UTC(2026, 8, 8);
    expect(isCurrentMonth(2026, 9, now)).toBe(true);
    expect(isCurrentMonth(2026, 8, now)).toBe(false);
    expect(isCurrentMonth(2025, 9, now)).toBe(false);
  });
});

describe('utcNoonOf', () => {
  it('stores a local calendar day as UTC noon of that same day, whatever the local offset', () => {
    // A local-midnight Date for Sep 1 — in any timezone, its local
    // year/month/day are what the user picked.
    const local = new Date(2026, 8, 1);
    const stored = utcNoonOf(local);
    expect(new Date(stored).toISOString()).toBe('2026-09-01T12:00:00.000Z');
    // And it lands inside September's UTC range, never August's.
    const { start } = getCurrentMonthRange(Date.UTC(2026, 8, 15));
    expect(stored).toBeGreaterThanOrEqual(start);
  });
});

describe('getPreviousYearMonth', () => {
  it('returns the prior month within the same year', () => {
    expect(getPreviousYearMonth(Date.UTC(2026, 8, 1))).toEqual({ year: 2026, month: 8 });
  });

  it('rolls back to December of the prior year from January', () => {
    expect(getPreviousYearMonth(Date.UTC(2026, 0, 1))).toEqual({ year: 2025, month: 12 });
  });
});
