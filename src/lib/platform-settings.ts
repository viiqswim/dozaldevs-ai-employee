import { PrismaClient } from '@prisma/client';

let _prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}

export async function getPlatformSetting(key: string): Promise<string> {
  const setting = await getPrisma().platformSetting.findFirst({
    where: { key, deleted_at: null },
  });

  if (!setting) {
    throw new Error(
      `Platform setting '${key}' not found. Ensure the database is seeded with all required platform settings.`,
    );
  }

  return setting.value;
}

export async function validateRequiredPlatformSettings(): Promise<void> {
  const requiredSettings = await getPrisma().platformSetting.findMany({
    where: { is_required: true, deleted_at: null },
    select: { key: true },
  });

  if (requiredSettings.length === 0) {
    throw new Error(
      'No required platform settings found in database. Run database migrations and seed to populate platform_settings table.',
    );
  }

  const missingKeys: string[] = [];
  for (const { key } of requiredSettings) {
    const setting = await getPrisma().platformSetting.findFirst({
      where: { key, deleted_at: null },
    });
    if (!setting || setting.value === undefined) {
      missingKeys.push(key);
    }
  }

  if (missingKeys.length > 0) {
    throw new Error(
      `Missing required platform settings: ${missingKeys.join(', ')}. Run database migrations and seed to populate platform_settings table.`,
    );
  }
}
