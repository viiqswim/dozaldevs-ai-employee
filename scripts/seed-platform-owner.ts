#!/usr/bin/env tsx
/**
 * seed-platform-owner.ts — Bootstrap a PLATFORM_OWNER user in Supabase Auth and the app DB.
 *
 * -- Break-glass: UPDATE users SET role='PLATFORM_OWNER' WHERE email='<email>';
 *
 * Idempotent: produces exactly 1 PLATFORM_OWNER user and 2 OWNER memberships (DozalDevs + VLRE).
 *
 * Required env: BOOTSTRAP_OWNER_EMAIL, SUPABASE_URL, SUPABASE_SECRET_KEY, DATABASE_URL
 * Optional env: BOOTSTRAP_OWNER_PASSWORD (defaults to a random strong password, printed once)
 *
 * Usage: pnpm seed-platform-owner
 */

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const DOZALDEVS_TENANT_ID = '00000000-0000-0000-0000-000000000002';
const VLRE_TENANT_ID = '00000000-0000-0000-0000-000000000003';

export interface SeedResult {
  email: string;
  supabaseId: string;
  appUserId: string;
  membershipTenantIds: string[];
}

type PrismaWithUserModels = PrismaClient & {
  user: {
    upsert(args: {
      where: { supabase_id: string };
      create: { supabase_id: string; email: string; role: string };
      update: { email: string; role: string };
    }): Promise<{ id: string }>;
  };
  tenantMembership: {
    upsert(args: {
      where: { tenant_id_user_id: { tenant_id: string; user_id: string } };
      create: { tenant_id: string; user_id: string; role: string };
      update: { role: string; deleted_at: null };
    }): Promise<unknown>;
  };
};

export async function seedPlatformOwner(): Promise<SeedResult> {
  const email = process.env.BOOTSTRAP_OWNER_EMAIL;
  if (!email) {
    throw new Error('BOOTSTRAP_OWNER_EMAIL env var is required');
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL env var is required');
  }

  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('SUPABASE_SECRET_KEY env var is required');
  }

  const password = process.env.BOOTSTRAP_OWNER_PASSWORD ?? randomBytes(16).toString('hex');

  let supabaseId: string;

  const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });

  if (createRes.ok) {
    const data = (await createRes.json()) as { id: string };
    supabaseId = data.id;
  } else if (createRes.status === 422) {
    // 422 = user already exists in Supabase Auth — look up by email
    const listRes = await fetch(
      `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}&per_page=100`,
      {
        headers: {
          apikey: secretKey,
          Authorization: `Bearer ${secretKey}`,
        },
      },
    );
    if (!listRes.ok) {
      throw new Error(
        `Failed to look up existing Supabase user: ${listRes.status} ${await listRes.text()}`,
      );
    }
    const list = (await listRes.json()) as {
      users?: Array<{ id: string; email: string }>;
    };
    const found = list.users?.find((u) => u.email === email);
    if (!found) {
      throw new Error(
        `User ${email} not found in Supabase auth after 422 — manual inspection required`,
      );
    }
    supabaseId = found.id;
  } else {
    throw new Error(
      `Supabase auth user creation failed: ${createRes.status} ${await createRes.text()}`,
    );
  }

  const prisma = new PrismaClient() as unknown as PrismaWithUserModels;
  try {
    const user = await prisma.user.upsert({
      where: { supabase_id: supabaseId },
      create: {
        supabase_id: supabaseId,
        email,
        role: 'PLATFORM_OWNER',
      },
      update: {
        email,
        role: 'PLATFORM_OWNER',
      },
    });

    const tenantIds = [DOZALDEVS_TENANT_ID, VLRE_TENANT_ID];
    for (const tenantId of tenantIds) {
      await prisma.tenantMembership.upsert({
        where: {
          tenant_id_user_id: { tenant_id: tenantId, user_id: user.id },
        },
        create: { tenant_id: tenantId, user_id: user.id, role: 'OWNER' },
        update: { role: 'OWNER', deleted_at: null },
      });
    }

    return {
      email,
      supabaseId,
      appUserId: user.id,
      membershipTenantIds: tenantIds,
    };
  } finally {
    await (prisma as unknown as PrismaClient).$disconnect();
  }
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] === __filename;

if (isMain) {
  if (!process.env.SUPABASE_URL) {
    try {
      const envContent = readFileSync('.env', 'utf8');
      for (const line of envContent.split('\n')) {
        const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2].trim().replace(/^"|"$/g, '');
        }
      }
    } catch {
      // .env not present — rely on shell environment
    }
  }

  const generatedPassword = !process.env.BOOTSTRAP_OWNER_PASSWORD;
  if (generatedPassword) {
    const pw = randomBytes(16).toString('hex');
    process.env.BOOTSTRAP_OWNER_PASSWORD = pw;
    console.log('\n⚠  No BOOTSTRAP_OWNER_PASSWORD set — generated:');
    console.log(`   ${pw}`);
    console.log('   Save this — it will not be shown again.\n');
  }

  seedPlatformOwner()
    .then((result) => {
      console.log('\n✓ Bootstrap complete:');
      console.log(`  owner=${result.email}`);
      console.log(`  supabase_id=${result.supabaseId}`);
      console.log(`  app_user_id=${result.appUserId}`);
      console.log(`  memberships=[DozalDevs, VLRE]`);
    })
    .catch((err: unknown) => {
      console.error('\n✗ Bootstrap failed:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
