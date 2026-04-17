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

  const summary = config['summary'] as Record<string, unknown> | undefined;
  if (summary) {
    const channelIds = summary['channel_ids'];
    if (Array.isArray(channelIds) && channelIds.length > 0) {
      env['DAILY_SUMMARY_CHANNELS'] = (channelIds as string[]).join(',');
    }
    const targetChannel = summary['target_channel'];
    if (typeof targetChannel === 'string' && targetChannel) {
      env['SUMMARY_TARGET_CHANNEL'] = targetChannel;
    }
    const publishChannel = summary['publish_channel'];
    if (typeof publishChannel === 'string' && publishChannel) {
      env['SUMMARY_PUBLISH_CHANNEL'] = publishChannel;
    }
  }

  return env;
}
