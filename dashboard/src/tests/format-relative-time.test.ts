import { formatRelativeTime } from '../lib/utils';

describe('formatRelativeTime', () => {
  it('returns "—" for empty string', () => {
    expect(formatRelativeTime('')).toBe('—');
  });

  it('returns "just now" for 30 seconds ago (< 60s)', () => {
    const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
    expect(formatRelativeTime(thirtySecondsAgo)).toBe('just now');
  });

  it('returns "2m ago" for 2 minutes ago (with Z suffix)', () => {
    const twoMinutesAgo = new Date(Date.now() - 120000).toISOString();
    expect(formatRelativeTime(twoMinutesAgo)).toBe('2m ago');
  });

  it('returns "3h ago" for 3 hours ago', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600000).toISOString();
    expect(formatRelativeTime(threeHoursAgo)).toBe('3h ago');
  });

  it('returns "2d ago" for 2 days ago', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
    expect(formatRelativeTime(twoDaysAgo)).toBe('2d ago');
  });

  it('does NOT return "just now" for a very old date without Z suffix', () => {
    const result = formatRelativeTime('2020-01-01T12:00:00');
    expect(result).not.toBe('just now');
    expect(result.length).toBeGreaterThan(0);
  });

  it('does NOT return "just now" for a date 5+ months ago without Z suffix (the fixed behavior)', () => {
    const result = formatRelativeTime('2026-01-01T06:00:00');
    expect(result).not.toBe('just now');
    expect(result.length).toBeGreaterThan(0);
  });
});
