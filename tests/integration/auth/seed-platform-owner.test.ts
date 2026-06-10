import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getPrisma, disconnectPrisma } from '../../setup.js';
import { seedPlatformOwner } from '../../../scripts/seed-platform-owner.js';

const TEST_EMAIL = 'test-bootstrap-owner@test.local';
const DOZALDEVS_TENANT_ID = '00000000-0000-0000-0000-000000000002';
const VLRE_TENANT_ID = '00000000-0000-0000-0000-000000000003';

function loadRealSecretKey(): string {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    const match = content.match(/^SUPABASE_SECRET_KEY=(.+)$/m);
    return match?.[1]?.trim().replace(/^"|"$/g, '') ?? '';
  } catch {
    return '';
  }
}

const realSecretKey = loadRealSecretKey();
const hasRealSupabaseKey = realSecretKey.startsWith('eyJ');

describe.runIf(hasRealSupabaseKey)('seed-platform-owner', () => {
  let seededAppUserId: string | undefined;

  beforeAll(() => {
    process.env.BOOTSTRAP_OWNER_EMAIL = TEST_EMAIL;
    process.env.SUPABASE_SECRET_KEY = realSecretKey;
    delete process.env.BOOTSTRAP_OWNER_PASSWORD;
  });

  afterAll(async () => {
    const prisma = getPrisma();
    if (seededAppUserId) {
      await prisma.$executeRaw`
        DELETE FROM tenant_memberships WHERE user_id = ${seededAppUserId}::uuid
      `;
      await prisma.$executeRaw`
        DELETE FROM users WHERE id = ${seededAppUserId}::uuid
      `;
    } else {
      await prisma.$executeRaw`
        DELETE FROM tenant_memberships
        WHERE user_id IN (SELECT id FROM users WHERE email = ${TEST_EMAIL})
      `;
      await prisma.$executeRaw`
        DELETE FROM users WHERE email = ${TEST_EMAIL}
      `;
    }
    await disconnectPrisma();
  });

  it('creates exactly 1 PLATFORM_OWNER user', async () => {
    const result = await seedPlatformOwner();
    seededAppUserId = result.appUserId;

    expect(result.email).toBe(TEST_EMAIL);
    expect(result.supabaseId).toBeTruthy();
    expect(result.appUserId).toBeTruthy();

    const prisma = getPrisma();
    const owners = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM users WHERE role = 'PLATFORM_OWNER' AND email = ${TEST_EMAIL}
    `;
    expect(Number(owners[0].count)).toBe(1);
  });

  it('running seed twice stays exactly 1 PLATFORM_OWNER (idempotent)', async () => {
    const first = await seedPlatformOwner();
    const second = await seedPlatformOwner();

    expect(second.appUserId).toBe(first.appUserId);
    expect(second.supabaseId).toBe(first.supabaseId);

    const prisma = getPrisma();
    const owners = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM users WHERE role = 'PLATFORM_OWNER' AND email = ${TEST_EMAIL}
    `;
    expect(Number(owners[0].count)).toBe(1);
  });

  it('creates OWNER memberships for both seeded tenants', async () => {
    const result = await seedPlatformOwner();
    seededAppUserId = result.appUserId;

    const prisma = getPrisma();
    const memberships = await prisma.$queryRaw<Array<{ tenant_id: string; role: string }>>`
      SELECT tenant_id::text, role FROM tenant_memberships
      WHERE user_id = ${result.appUserId}::uuid
      AND deleted_at IS NULL
      ORDER BY tenant_id
    `;

    expect(memberships).toHaveLength(2);
    const tenantIds = memberships.map((m) => m.tenant_id);
    expect(tenantIds).toContain(DOZALDEVS_TENANT_ID);
    expect(tenantIds).toContain(VLRE_TENANT_ID);
    for (const m of memberships) {
      expect(m.role).toBe('OWNER');
    }
  });
});

describe.skipIf(hasRealSupabaseKey)('seed-platform-owner (skipped — no real Supabase key)', () => {
  it.skip('requires SUPABASE_SECRET_KEY starting with eyJ in .env', () => {});
});
