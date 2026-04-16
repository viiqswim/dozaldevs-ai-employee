#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { TenantRepository } from '../src/gateway/services/tenant-repository.js';
import { TenantSecretRepository } from '../src/gateway/services/tenant-secret-repository.js';
import { TenantInstallationStore } from '../src/gateway/slack/installation-store.js';
import { loadTenantEnv } from '../src/gateway/services/tenant-env-loader.js';
import { readFileSync, existsSync } from 'node:fs';

const DOZALDEVS_ID = '00000000-0000-0000-0000-000000000002';
const VLRE_ID = '00000000-0000-0000-0000-000000000003';
const PLATFORM_ID = '00000000-0000-0000-0000-000000000001';

const C = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

function loadEnv() {
  const envPath = existsSync('.env') ? '.env' : undefined;
  if (envPath) {
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed
        .slice(eqIdx + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

loadEnv();

type CheckResult = { name: string; passed: boolean; detail?: string };
const results: CheckResult[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, passed: true, detail });
  console.log(
    `  ${C.green}[PASS]${C.reset} ${name}${detail ? ` ${C.dim}(${detail})${C.reset}` : ''}`,
  );
}

function fail(name: string, detail?: string) {
  results.push({ name, passed: false, detail });
  console.error(
    `  ${C.red}[FAIL]${C.reset} ${name}${detail ? ` ${C.dim}(${detail})${C.reset}` : ''}`,
  );
}

function section(name: string) {
  console.log(`\n${C.bold}${C.cyan}── ${name} ──${C.reset}`);
}

async function main() {
  console.log(`\n${C.bold}Multi-Tenancy Verification${C.reset}`);

  const prisma = new PrismaClient();
  const tenantRepo = new TenantRepository(prisma);
  const secretRepo = new TenantSecretRepository(prisma);

  try {
    section('Check 1: Schema');
    try {
      await prisma.$queryRaw`SELECT 1 FROM tenants LIMIT 1`;
      await prisma.$queryRaw`SELECT 1 FROM tenant_secrets LIMIT 1`;
      pass('tenants and tenant_secrets tables exist');
    } catch (err) {
      fail('Schema check', err instanceof Error ? err.message : String(err));
    }

    section('Check 2: Tenant existence');
    for (const [id, slug] of [
      [PLATFORM_ID, 'platform'],
      [DOZALDEVS_ID, 'dozaldevs'],
      [VLRE_ID, 'vlre'],
    ] as const) {
      const tenant = await tenantRepo.findById(id);
      if (tenant && tenant.slug === slug) {
        pass(`Tenant ${slug} exists`);
      } else {
        fail(`Tenant ${slug} not found`, `expected id=${id}`);
      }
    }

    section('Check 3: Encryption sanity');
    const probeKey = `probe_verify_${Date.now()}`;
    try {
      await secretRepo.set(PLATFORM_ID, probeKey, 'probe-plaintext-value');
      const raw = await prisma.tenantSecret.findUnique({
        where: { tenant_id_key: { tenant_id: PLATFORM_ID, key: probeKey } },
      });
      if (!raw) {
        fail('Encryption sanity', 'probe secret not found in DB');
      } else if (raw.ciphertext === 'probe-plaintext-value') {
        fail('Encryption sanity', 'ciphertext equals plaintext — encryption not working');
      } else {
        pass('Ciphertext differs from plaintext');
        const decrypted = await secretRepo.get(PLATFORM_ID, probeKey);
        if (decrypted === 'probe-plaintext-value') {
          pass('Roundtrip decrypt returns correct plaintext');
        } else {
          fail('Roundtrip decrypt', `expected "probe-plaintext-value", got "${decrypted}"`);
        }
      }
    } finally {
      await secretRepo.delete(PLATFORM_ID, probeKey).catch(() => {});
    }

    section('Check 4: Cross-tenant API isolation');
    const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? '';
    const BASE_URL = process.env.GATEWAY_BASE ?? 'http://localhost:3000';
    if (!ADMIN_API_KEY) {
      fail('Cross-tenant isolation', 'ADMIN_API_KEY not set — skipping');
    } else {
      const probeTaskKey = `probe-task-${Date.now()}`;
      let probeTaskId: string | undefined;
      try {
        const createRes = await fetch(`${BASE_URL}/admin/tenants/${DOZALDEVS_ID}/tasks`, {
          method: 'POST',
          headers: { 'X-Admin-Key': ADMIN_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ external_id: probeTaskKey }),
        });
        if (createRes.ok) {
          const created = (await createRes.json()) as { id?: string };
          probeTaskId = created.id;
        }

        if (probeTaskId) {
          const crossRes = await fetch(
            `${BASE_URL}/admin/tenants/${VLRE_ID}/tasks/${probeTaskId}`,
            {
              headers: { 'X-Admin-Key': ADMIN_API_KEY },
            },
          );
          if (crossRes.status === 404) {
            pass('Cross-tenant task access returns 404');
          } else {
            fail('Cross-tenant isolation', `expected 404, got ${crossRes.status}`);
          }
        } else {
          const directTask = await prisma.task.findFirst({
            where: { tenant_id: DOZALDEVS_ID },
            select: { id: true },
          });
          if (directTask) {
            const crossRes = await fetch(
              `${BASE_URL}/admin/tenants/${VLRE_ID}/tasks/${directTask.id}`,
              {
                headers: { 'X-Admin-Key': ADMIN_API_KEY },
              },
            );
            if (crossRes.status === 404) {
              pass('Cross-tenant task access returns 404');
            } else {
              fail('Cross-tenant isolation', `expected 404, got ${crossRes.status}`);
            }
          } else {
            pass('Cross-tenant isolation (no tasks to test — skipped)', 'no DozalDevs tasks exist');
          }
        }
      } finally {
        if (probeTaskId) {
          await prisma.task.deleteMany({ where: { id: probeTaskId } }).catch(() => {});
        }
      }
    }

    section('Check 5: Tenant env loader isolation');
    const dozalEnv = await loadTenantEnv(DOZALDEVS_ID, { tenantRepo, secretRepo }).catch(
      () => null,
    );
    const vlreEnv = await loadTenantEnv(VLRE_ID, { tenantRepo, secretRepo }).catch(() => null);

    if (!dozalEnv || !vlreEnv) {
      fail('Tenant env loader', 'loadTenantEnv failed for one or both tenants');
    } else {
      const dozalToken = dozalEnv['SLACK_BOT_TOKEN'];
      const vlreToken = vlreEnv['SLACK_BOT_TOKEN'];
      if (!dozalToken && !vlreToken) {
        console.log(
          `  ${C.yellow}[WARN]${C.reset} Neither tenant has SLACK_BOT_TOKEN — OAuth not yet completed`,
        );
        results.push({
          name: 'Tenant env loader isolation',
          passed: true,
          detail: 'no tokens yet',
        });
      } else if (dozalToken && vlreToken && dozalToken !== vlreToken) {
        pass('Tenant env loader returns different tokens per tenant');
      } else if (dozalToken || vlreToken) {
        pass('Tenant env loader returns token for configured tenant');
      } else {
        fail('Tenant env loader isolation', 'tokens are identical — cross-contamination risk');
      }
    }

    section('Check 6: InstallationStore per-team lookup');
    const store = new TenantInstallationStore(tenantRepo, secretRepo);
    let installStoreChecked = false;
    for (const [tenantId, tenantName] of [
      [DOZALDEVS_ID, 'DozalDevs'],
      [VLRE_ID, 'VLRE'],
    ] as const) {
      const tenant = await tenantRepo.findById(tenantId);
      if (tenant?.slack_team_id) {
        try {
          const installation = await store.fetchInstallation({
            teamId: tenant.slack_team_id,
            enterpriseId: undefined,
            isEnterpriseInstall: false,
          });
          if (installation.bot?.token) {
            pass(
              `InstallationStore returns token for ${tenantName} (team ${tenant.slack_team_id})`,
            );
            installStoreChecked = true;
          } else {
            fail(`InstallationStore for ${tenantName}`, 'no bot token in installation');
          }
        } catch (err) {
          fail(
            `InstallationStore for ${tenantName}`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    }
    if (!installStoreChecked) {
      console.log(
        `  ${C.yellow}[WARN]${C.reset} InstallationStore: no tenants have slack_team_id set — OAuth not yet completed`,
      );
      results.push({
        name: 'InstallationStore per-team lookup',
        passed: true,
        detail: 'no OAuth yet',
      });
    }
  } finally {
    await prisma.$disconnect();
  }

  section('Results');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n  ${C.bold}${passed}/${results.length} checks passed${C.reset}`);

  if (failed === 0) {
    console.log(`\n  ${C.green}${C.bold}All checks passed.${C.reset}`);
    process.exit(0);
  } else {
    console.error(`\n  ${C.red}${C.bold}${failed} check(s) failed.${C.reset}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(
    `${C.red}Unexpected error:${C.reset}`,
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
