import { describe, expect, it } from 'vitest';
import {
  getCurrentMonthRange,
  getPreviousYearMonth,
  isFirstOfMonthUtc,
  todayDateOnly,
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

describe('isFirstOfMonthUtc', () => {
  it('is true on the 1st, false on any other day', () => {
    expect(isFirstOfMonthUtc(Date.UTC(2026, 8, 1, 0, 0, 0))).toBe(true);
    expect(isFirstOfMonthUtc(Date.UTC(2026, 8, 1, 23, 59, 59))).toBe(true);
    expect(isFirstOfMonthUtc(Date.UTC(2026, 8, 2, 0, 0, 0))).toBe(false);
    expect(isFirstOfMonthUtc(Date.UTC(2026, 8, 30))).toBe(false);
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
