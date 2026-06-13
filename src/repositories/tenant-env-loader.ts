/**
 * Assembles a worker-env record from tenant config + encrypted secrets.
 *
 * Location rationale: Depends on TenantRepository and TenantSecretRepository
 * (both Prisma-backed). Lives in `src/repositories/` alongside them so that
 * `src/inngest/` can import without crossing into the Gateway layer.
 */
import { resolveNotificationChannel } from './notification-channel.js';
import type { TenantRepository } from './tenant-repository.js';
import type { TenantSecretRepository } from './tenant-secret-repository.js';

// Security boundary: platform vars only (gateway process.env → all workers).
// NOT tenant secrets (encrypted, per-tenant) and NOT task-scoped vars (set per-task).
// Exported for the env-enforcement parity test, not for runtime use elsewhere.
export const PLATFORM_ENV_WHITELIST = [
  'AGENT_VERSION_ID',
  'COMPOSIO_API_KEY',
  'DATABASE_URL',
  'INNGEST_BASE_URL',
  'INNGEST_EVENT_KEY',
  'INNGEST_SIGNING_KEY',
  'LOG_LEVEL',
  'NODE_ENV',
  'NOTION_MOCK',
  'OPENCODE_GO_API_KEY',
  'OPENROUTER_API_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_URL',
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
    { notification_channel: archetypeNotificationChannel ?? undefined },
    { notification_channel: tenantNotificationChannel },
  );
  if (notificationChannel) {
    env['NOTIFICATION_CHANNEL'] = notificationChannel;
  }

  const sourceChannels = config['source_channels'];
  const legacyNotifConfig = config['summary'] as Record<string, unknown> | undefined;
  const legacyChannelIds = legacyNotifConfig?.['channel_ids'];
  const channelList = Array.isArray(sourceChannels)
    ? sourceChannels
    : Array.isArray(legacyChannelIds)
      ? legacyChannelIds
      : [];
  if (channelList.length > 0) {
    env['SOURCE_CHANNELS'] = (channelList as string[]).join(',');
  }

  const publishChannel = legacyNotifConfig?.['publish_channel'];
  if (typeof publishChannel === 'string' && publishChannel) {
    env['PUBLISH_CHANNEL'] = publishChannel;
  }

  const manifestKeys = Object.keys(env).filter(
    (k) => !PLATFORM_ENV_WHITELIST.includes(k) && k !== 'PLATFORM_ENV_MANIFEST',
  );
  if (manifestKeys.length > 0) {
    env['PLATFORM_ENV_MANIFEST'] = manifestKeys.join(',');
  }

  return env;
}
