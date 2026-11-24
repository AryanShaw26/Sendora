import { describe, it, expect } from 'vitest';
import { utcHourKey, startOfNextUtcHour } from '../src/utils/time';

describe('Time utilities', () => {
  it('correctly generates UTC hour key YYYYMMDDHH', () => {
    const d = new Date(Date.UTC(2026, 10, 24, 15, 30, 45)); // Nov 24, 2026 15:30:45 UTC
    expect(utcHourKey(d)).toBe('2026112415');
  });

  it('correctly calculates the start of next UTC hour', () => {
    const d = new Date(Date.UTC(2026, 10, 24, 15, 45, 12));
    const nextHour = startOfNextUtcHour(d);
    expect(nextHour.toISOString()).toBe('2026-11-24T16:00:00.000Z');
  });

  it('handles hour boundary transition (e.g. 23:59 to next day 00:00)', () => {
    const d = new Date(Date.UTC(2026, 10, 24, 23, 59, 59));
    const nextHour = startOfNextUtcHour(d);
    expect(nextHour.toISOString()).toBe('2026-11-25T00:00:00.000Z');
    expect(utcHourKey(nextHour)).toBe('2026112500');
  });
});
