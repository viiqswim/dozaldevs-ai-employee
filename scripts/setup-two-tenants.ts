#!/usr/bin/env tsx
import { createInterface } from 'node:readline';
import { readFileSync, existsSync } from 'node:fs';

const DOZALDEVS_ID = '00000000-0000-0000-0000-000000000002';
const VLRE_ID = '00000000-0000-0000-0000-000000000003';

const C = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

function ok(msg: string) {
  console.log(`${C.green}✓${C.reset} ${msg}`);
}
function info(msg: string) {
  console.log(`${C.blue}→${C.reset} ${msg}`);
}
function warn(msg: string) {
  console.log(`${C.yellow}⚠${C.reset} ${msg}`);
}
function fail(msg: string) {
  console.error(`${C.red}✗${C.reset} ${msg}`);
}
function section(name: string) {
  console.log(`\n${C.bold}${C.cyan}── ${name} ──${C.reset}`);
}

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

const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? '';
const BASE_URL = process.env.GATEWAY_BASE ?? 'http://localhost:3000';

if (!ADMIN_API_KEY) {
  fail('ADMIN_API_KEY not set. Run pnpm setup first or set it in .env.');
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      rl.once('line', (line) => resolve(line.trim()));
    } else {
      rl.question(question, (answer) => resolve(answer.trim()));
    }
  });
}

async function apiGet(path: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'X-Admin-Key': ADMIN_API_KEY },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function apiPost(
  path: string,
  data: unknown,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'X-Admin-Key': ADMIN_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function apiPatch(
  path: string,
  data: unknown,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers: { 'X-Admin-Key': ADMIN_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function ensureTenant(id: string, name: string, slug: string): Promise<boolean> {
  const existing = await apiGet(`/admin/tenants/${id}`);
  if (existing.ok) {
    ok(`Tenant ${name} already exists`);
    return true;
  }
  const created = await apiPost('/admin/tenants', { id, name, slug });
  if (created.ok) {
    ok(`Tenant ${name} created`);
    return true;
  }
  fail(`Failed to create tenant ${name}: ${JSON.stringify(created.body)}`);
  return false;
}

async function hasSecret(tenantId: string, key: string): Promise<boolean> {
  const res = await apiGet(`/admin/tenants/${tenantId}/secrets`);
  if (!res.ok) return false;
  const secrets = res.body as Array<{ key: string }>;
  return Array.isArray(secrets) && secrets.some((s) => s.key === key);
}

async function main() {
  section('Setup: DozalDevs + VLRE Multi-Tenancy');

  section('Step 1: Ensure tenants exist');
  const dozalOk = await ensureTenant(DOZALDEVS_ID, 'DozalDevs', 'dozaldevs');
  const vlreOk = await ensureTenant(VLRE_ID, 'VLRE', 'vlre');
  if (!dozalOk || !vlreOk) {
    fail('Tenant creation failed. Is the gateway running? (pnpm dev:start)');
    rl.close();
    process.exit(1);
  }

  section('Step 2: VLRE legacy Slack token migration');
  const legacyToken = process.env.SLACK_BOT_TOKEN;
  const vlreHasToken = await hasSecret(VLRE_ID, 'slack_bot_token');

  if (vlreHasToken) {
    ok('VLRE already has slack_bot_token — skipping migration');
  } else if (legacyToken) {
    info('Migrating legacy SLACK_BOT_TOKEN env var into VLRE tenant_secrets...');
    const secretRes = await apiPost(`/admin/tenants/${VLRE_ID}/secrets`, {
      key: 'slack_bot_token',
      value: legacyToken,
    });
    if (!secretRes.ok) {
      fail(`Failed to store VLRE slack_bot_token: ${JSON.stringify(secretRes.body)}`);
      rl.close();
      process.exit(1);
    }
    ok('VLRE slack_bot_token stored');

    const teamId = await prompt('Enter VLRE Slack team ID (format T0XXXXX): ');
    if (teamId) {
      const patchRes = await apiPatch(`/admin/tenants/${VLRE_ID}`, { slack_team_id: teamId });
      if (patchRes.ok) {
        ok(`VLRE slack_team_id set to ${teamId}`);
      } else {
        warn(`Failed to set VLRE slack_team_id: ${JSON.stringify(patchRes.body)}`);
      }
    }
    info('VLRE migration complete. You may now remove SLACK_BOT_TOKEN from .env.');
  } else {
    warn('No SLACK_BOT_TOKEN in env and VLRE has no slack_bot_token. VLRE Slack not configured.');
    warn('Run the OAuth flow for VLRE or set SLACK_BOT_TOKEN to migrate the legacy token.');
  }

  section('Step 3: DozalDevs Slack OAuth install');
  const dozalTenant = await apiGet(`/admin/tenants/${DOZALDEVS_ID}`);
  const dozalData = dozalTenant.body as { slack_team_id?: string | null };
  if (dozalData?.slack_team_id) {
    ok(`DozalDevs already has slack_team_id: ${dozalData.slack_team_id}`);
  } else {
    info(`To install the Slack bot in DozalDevs workspace, visit:`);
    info(`  ${BASE_URL}/slack/install?tenant=${DOZALDEVS_ID}`);
    info('You will be redirected to Slack to grant scopes, then back to a confirmation page.');
    await prompt('After installing the bot in DozalDevs workspace, press Enter to continue...');

    const recheckDozal = await apiGet(`/admin/tenants/${DOZALDEVS_ID}`);
    const recheckData = recheckDozal.body as { slack_team_id?: string | null };
    if (!recheckData?.slack_team_id) {
      warn('DozalDevs slack_team_id is still not set. OAuth may not have completed.');
      warn('Proceeding anyway — re-run this script after completing OAuth.');
    } else {
      ok(`DozalDevs slack_team_id confirmed: ${recheckData.slack_team_id}`);
    }
  }

  section('Step 4: Per-tenant channel configuration');
  for (const [tenantId, tenantName] of [
    [DOZALDEVS_ID, 'DozalDevs'],
    [VLRE_ID, 'VLRE'],
  ] as const) {
    const configRes = await apiGet(`/admin/tenants/${tenantId}/config`);
    const configData = configRes.body as {
      summary?: { channel_ids?: string[]; target_channel?: string };
    };
    const existingChannels = configData?.summary?.channel_ids ?? [];
    const existingTarget = configData?.summary?.target_channel ?? '';

    if (existingChannels.length > 0 && existingTarget) {
      ok(
        `${tenantName} channels already configured (${existingChannels.join(',')}) → ${existingTarget}`,
      );
      continue;
    }

    info(`Configuring channels for ${tenantName}:`);
    const channelIdsRaw = await prompt(
      `  Source channel IDs for ${tenantName} (comma-separated, e.g., C0123,C0456): `,
    );
    const targetChannel = await prompt(`  Target channel ID for ${tenantName} digest posting: `);

    if (!channelIdsRaw || !targetChannel) {
      warn(`Skipping channel config for ${tenantName} — no input provided`);
      continue;
    }

    const channelIds = channelIdsRaw
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const patchRes = await apiPatch(`/admin/tenants/${tenantId}/config`, {
      summary: { channel_ids: channelIds, target_channel: targetChannel },
    });
    if (patchRes.ok) {
      ok(`${tenantName} channel config saved`);
    } else {
      warn(`Failed to save ${tenantName} channel config: ${JSON.stringify(patchRes.body)}`);
    }
  }

  section('Step 5: Verification');
  let allGood = true;
  const rows: Array<{ name: string; slack_team_id: string; has_token: string; channels: string }> =
    [];

  for (const [tenantId, tenantName] of [
    [DOZALDEVS_ID, 'DozalDevs'],
    [VLRE_ID, 'VLRE'],
  ] as const) {
    const tenantRes = await apiGet(`/admin/tenants/${tenantId}`);
    const tenantData = tenantRes.body as { slack_team_id?: string | null; config?: unknown };
    const secretsRes = await apiGet(`/admin/tenants/${tenantId}/secrets`);
    const secrets = secretsRes.body as Array<{ key: string }>;
    const configRes = await apiGet(`/admin/tenants/${tenantId}/config`);
    const configData = configRes.body as { summary?: { channel_ids?: string[] } };

    const hasSlackTeamId = !!tenantData?.slack_team_id;
    const hasToken = Array.isArray(secrets) && secrets.some((s) => s.key === 'slack_bot_token');
    const channels = configData?.summary?.channel_ids ?? [];

    if (!hasSlackTeamId) {
      warn(`${tenantName}: slack_team_id not set`);
      allGood = false;
    }
    if (!hasToken) {
      warn(`${tenantName}: slack_bot_token not in secrets`);
      allGood = false;
    }
    if (channels.length === 0) {
      warn(`${tenantName}: no channel_ids configured`);
      allGood = false;
    }

    rows.push({
      name: tenantName,
      slack_team_id: tenantData?.slack_team_id ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`,
      has_token: hasToken ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`,
      channels:
        channels.length > 0 ? `${C.green}✓${C.reset} (${channels.length})` : `${C.red}✗${C.reset}`,
    });
  }

  section('Summary');
  console.log(
    `  ${'Tenant'.padEnd(12)} ${'slack_team_id'.padEnd(16)} ${'slack_bot_token'.padEnd(18)} channels`,
  );
  console.log(`  ${'─'.repeat(60)}`);
  for (const row of rows) {
    console.log(
      `  ${row.name.padEnd(12)} ${row.slack_team_id.padEnd(16)} ${row.has_token.padEnd(18)} ${row.channels}`,
    );
  }

  if (allGood) {
    ok('\nSetup complete. Run: pnpm verify:multi-tenancy to confirm end-to-end.');
  } else {
    warn('\nSetup incomplete. Address the warnings above and re-run this script.');
  }

  rl.close();
  process.exit(allGood ? 0 : 1);
}

main().catch((err) => {
  fail(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  rl.close();
  process.exit(1);
});
