export function resolveNotificationChannel(
  archetype: { notification_channel: string | null | undefined },
  tenantConfig: { notification_channel?: string },
): string {
  if (archetype.notification_channel === null) return '';
  return archetype.notification_channel ?? tenantConfig.notification_channel ?? '';
}
