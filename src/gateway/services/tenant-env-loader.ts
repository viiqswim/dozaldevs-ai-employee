import { resolveNotificationChannel } from './notification-channel.js';
import type { TenantRepository } from './tenant-repository.js';
import type { TenantSecretRepository } from './tenant-secret-repository.js';

const PLATFORM_ENV_WHITELIST = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'INNGEST_EVENT_KEY',
  'INNGEST_SIGNING_KEY',
  'INNGEST_BASE_URL',
  'OPENROUTER_API_KEY',
  'NODE_ENV',
  'LOG_LEVEL',
  'AGENT_VERSION_ID',
];

export async function loadTenantEnv(
  tenantId: string,
  deps: { tenantRepo: TenantRepository; secretRepo: TenantSecretRepository },
  archetypeNotificationChannel?: string | null,
): Promise<Record<string, string>> {
  const tenant = await deps.tenantRepo.findById(tenantId);
  if (!tenant) {
    throw new Error(`Tenant not found: ${tenantId}`);
  }

  const secretMetas = await deps.secretRepo.listKeys(tenantId);
  const secretKeys = secretMetas.map((m) => m.key);
  const secrets = secretKeys.length > 0 ? await deps.secretRepo.getMany(tenantId, secretKeys) : {};

  const env: Record<string, string> = {};

  for (const key of PLATFORM_ENV_WHITELIST) {
    const val = process.env[key];
    if (val !== undefined) {
      env[key] = val;
    }
  }

  for (const [key, value] of Object.entries(secrets)) {
    env[key.toUpperCase()] = value;
  }

  const config =
    tenant.config !== null && typeof tenant.config === 'object' && !Array.isArray(tenant.config)
      ? (tenant.config as Record<string, unknown>)
      : {};

  const tenantNotificationChannel =
    typeof config['notification_channel'] === 'string' ? config['notification_channel'] : undefined;
  const notificationChannel = resolveNotificationChannel(
    { notification_channel: archetypeNotificationChannel ?? null },
    { notification_channel: tenantNotificationChannel },
  );
  if (notificationChannel) {
    env['NOTIFICATION_CHANNEL'] = notificationChannel;
  }

  const sourceChannels = config['source_channels'];
  const summary = config['summary'] as Record<string, unknown> | undefined;
  const legacyChannelIds = summary?.['channel_ids'];
  const channelList = Array.isArray(sourceChannels)
    ? sourceChannels
    : Array.isArray(legacyChannelIds)
      ? legacyChannelIds
      : [];
  if (channelList.length > 0) {
    const joined = (channelList as string[]).join(',');
    env['SOURCE_CHANNELS'] = joined;
    env['DAILY_SUMMARY_CHANNELS'] = joined; // backward compat alias
  }

  // Keep SUMMARY_TARGET_CHANNEL as alias for backward compat (lifecycle uses it as fallback)
  const targetChannel = summary?.['target_channel'];
  if (typeof targetChannel === 'string' && targetChannel) {
    env['SUMMARY_TARGET_CHANNEL'] = targetChannel;
  }

  // SUMMARY_PUBLISH_CHANNEL removed — it was never read by any production code

  return env;
}
