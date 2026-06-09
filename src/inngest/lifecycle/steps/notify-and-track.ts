import { PrismaClient } from '@prisma/client';
import { createSlackClient } from '../../../lib/slack-client.js';
import { createLogger } from '../../../lib/logger.js';
import { loadTenantEnv } from '../../../repositories/tenant-env-loader.js';
import { TenantRepository } from '../../../repositories/tenant-repository.js';
import { TenantSecretRepository } from '../../../repositories/tenant-secret-repository.js';

export const log = createLogger('lifecycle-notify-and-track');

export interface TenantSlackContext {
  botToken: string;
  channel: string;
  tenantEnv: Record<string, string>;
  slackClient: ReturnType<typeof createSlackClient>;
}

export async function loadTenantSlack(
  tenantId: string,
  notificationChannel: string | null,
): Promise<TenantSlackContext | null> {
  const prisma = new PrismaClient();
  try {
    const tenantEnv = await loadTenantEnv(
      tenantId,
      {
        tenantRepo: new TenantRepository(prisma),
        secretRepo: new TenantSecretRepository(prisma),
      },
      notificationChannel,
    );
    const botToken = tenantEnv['SLACK_BOT_TOKEN'] ?? '';
    const channel = tenantEnv['NOTIFICATION_CHANNEL'] ?? '';
    if (!botToken) return null;
    return {
      botToken,
      channel,
      tenantEnv,
      slackClient: createSlackClient({ botToken, defaultChannel: channel }),
    };
  } finally {
    await prisma.$disconnect();
  }
}

export async function loadTenantEnvFull(
  tenantId: string,
  notificationChannel: string | null,
): Promise<Record<string, string>> {
  const prisma = new PrismaClient();
  try {
    return await loadTenantEnv(
      tenantId,
      {
        tenantRepo: new TenantRepository(prisma),
        secretRepo: new TenantSecretRepository(prisma),
      },
      notificationChannel,
    );
  } finally {
    await prisma.$disconnect();
  }
}
