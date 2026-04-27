/**
 * Resolves the notification channel for an employee.
 * Prefers the archetype-level override over the tenant-wide default.
 * Returns empty string if neither is configured (caller must handle).
 */
export function resolveNotificationChannel(
  archetype: { notification_channel: string | null | undefined },
  tenantConfig: { notification_channel?: string },
): string {
  return archetype.notification_channel ?? tenantConfig.notification_channel ?? '';
}
