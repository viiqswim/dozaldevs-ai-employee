import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUIET_HOURS,
  isQuietHours,
  shouldSendReminder,
} from '../../../src/inngest/lib/quiet-hours.js';

// January 15, 2026 is in CST (UTC-6, no DST). CT hour = UTC hour - 6.
const CT = (utcHour: number) =>
  new Date(`2026-01-15T${String(utcHour).padStart(2, '0')}:00:00Z`).getTime();

describe('isQuietHours', () => {
  describe('default config (America/Chicago, 1–8 AM)', () => {
    it('midnight (0:00 AM CT) is NOT quiet', () => {
      expect(isQuietHours(CT(6))).toBe(false);
    });

    it('1:00 AM CT is quiet (start boundary, inclusive)', () => {
      expect(isQuietHours(CT(7))).toBe(true);
    });

    it('3:00 AM CT is quiet (mid-window)', () => {
      expect(isQuietHours(CT(9))).toBe(true);
    });

    it('7:00 AM CT is quiet (just before end)', () => {
      expect(isQuietHours(CT(13))).toBe(true);
    });

    it('8:00 AM CT is NOT quiet (end boundary, exclusive)', () => {
      expect(isQuietHours(CT(14))).toBe(false);
    });

    it('12:00 PM CT is NOT quiet (midday)', () => {
      expect(isQuietHours(CT(18))).toBe(false);
    });

    it('11:00 PM CT is NOT quiet', () => {
      const ts = new Date('2026-01-16T05:00:00Z').getTime();
      expect(isQuietHours(ts)).toBe(false);
    });
  });

  describe('custom config', () => {
    it('uses custom timezone correctly', () => {
      const config = { start: 1, end: 8, timezone: 'America/New_York' };
      const ts = new Date('2026-01-15T08:00:00Z').getTime();
      expect(isQuietHours(ts, config)).toBe(true);
    });

    it('uses custom start/end hours', () => {
      const config = { start: 22, end: 23, timezone: 'America/Chicago' };
      const ts = new Date('2026-01-16T04:00:00Z').getTime();
      expect(isQuietHours(ts, config)).toBe(true);
    });

    it('hour outside custom range is not quiet', () => {
      const config = { start: 22, end: 23, timezone: 'America/Chicago' };
      expect(isQuietHours(CT(9), config)).toBe(false);
    });
  });

  describe('edge case: hour === 24 normalized to 0', () => {
    it('midnight is not quiet (default config start=1, so hour 0 < start)', () => {
      // Intl.DateTimeFormat may return 24 for midnight in some environments;
      // normalization to 0 ensures it is treated correctly as outside quiet hours.
      const midnight = new Date('2026-01-15T06:00:00Z').getTime();
      expect(isQuietHours(midnight)).toBe(false);
    });
  });
});

describe('shouldSendReminder', () => {
  const quietTime = CT(9);
  const activeTime = CT(18);

  it('non-urgent during quiet hours → false', () => {
    expect(shouldSendReminder(quietTime, DEFAULT_QUIET_HOURS, false)).toBe(false);
  });

  it('non-urgent outside quiet hours → true', () => {
    expect(shouldSendReminder(activeTime, DEFAULT_QUIET_HOURS, false)).toBe(true);
  });

  it('urgent during quiet hours → true (override)', () => {
    expect(shouldSendReminder(quietTime, DEFAULT_QUIET_HOURS, true)).toBe(true);
  });

  it('urgent outside quiet hours → true', () => {
    expect(shouldSendReminder(activeTime, DEFAULT_QUIET_HOURS, true)).toBe(true);
  });

  it('defaults isUrgent to false', () => {
    expect(shouldSendReminder(quietTime)).toBe(false);
    expect(shouldSendReminder(activeTime)).toBe(true);
  });
});
