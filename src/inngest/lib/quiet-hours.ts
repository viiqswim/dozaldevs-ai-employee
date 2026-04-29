export interface QuietHoursConfig {
  start: number; // hour (0-23), inclusive — quiet starts at this hour
  end: number; // hour (0-23), exclusive — quiet ends at this hour
  timezone: string; // IANA timezone string, e.g. 'America/Chicago'
}

export const DEFAULT_QUIET_HOURS: QuietHoursConfig = {
  start: 1,
  end: 8,
  timezone: 'America/Chicago',
};

/**
 * Returns true if the given timestamp falls within quiet hours for the given config.
 * Uses Intl.DateTimeFormat for DST-aware timezone conversion.
 * Edge case: hour === 24 is normalized to 0.
 */
export function isQuietHours(
  nowMs: number,
  config: QuietHoursConfig = DEFAULT_QUIET_HOURS,
): boolean {
  const hour = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: config.timezone,
      hour: 'numeric',
      hour12: false,
    }).format(new Date(nowMs)),
    10,
  );
  const normalizedHour = hour === 24 ? 0 : hour;
  return normalizedHour >= config.start && normalizedHour < config.end;
}

/**
 * Returns true if a reminder should be sent.
 * Urgent messages always get reminders (override quiet hours).
 * Non-urgent messages are suppressed during quiet hours.
 */
export function shouldSendReminder(
  nowMs: number,
  config: QuietHoursConfig = DEFAULT_QUIET_HOURS,
  isUrgent: boolean = false,
): boolean {
  if (isUrgent) return true;
  return !isQuietHours(nowMs, config);
}
