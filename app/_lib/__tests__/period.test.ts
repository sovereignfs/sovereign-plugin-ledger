import { describe, expect, it } from 'vitest';
import { getCurrentMonthRange, todayDateOnly } from '../period';

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
