#!/usr/bin/env tsx
/**
 * register-dev-slack-tenant — Register a dev Slack sandbox workspace with the local platform
 *
 * Upserts a `slack_integrations` row (provider='slack', external_id=<teamId>) and a
 * `tenant_secrets` row (key='slack_bot_token', value=<encrypted botToken>) so that
 * `fetchInstallation` in `installation-store.ts` can resolve the sandbox teamId to a
 * tenant + bot token.
 *
 * Usage:
 *   pnpm register-dev-slack --team-id T0601SMSVEU --bot-token xoxb-...
 *   pnpm register-dev-slack --team-id T06KFDGLHS6 --bot-token xoxb-... --tenant-id 00000000-0000-0000-0000-000000000003
 *
 * Options:
 *   --team-id    <T...>    Slack workspace team ID (required, starts with T)
 *   --bot-token  <xoxb-...> Slack bot token for the dev app (required, starts with xoxb-)
 *   --tenant-id  <uuid>    Target tenant UUID (optional — defaults to DozalDevs 00000000-0000-0000-0000-000000000002)
 *   --help                 Show this help
 *
 * Environment variables read from .env:
 *   DATABASE_URL   Prisma database connection string
 *   ENCRYPTION_KEY AES-256-GCM key for encrypting the bot token (64-char hex)
 */

import { readFileSync, existsSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { encrypt } from '../src/lib/encryption.js';

// ─── ANSI color helpers ───────────────────────────────────────────────────────

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

function ok(msg: string, detail?: string) {
  console.log(`${C.green}✓${C.reset} ${msg}${detail ? ` ${C.cyan}(${detail})${C.reset}` : ''}`);
}
function info(msg: string, detail?: string) {
  console.log(`${C.blue}→${C.reset} ${msg}${detail ? ` ${C.dim}${detail}${C.reset}` : ''}`);
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
function status(label: string, value: string) {
  console.log(`  ${C.dim}${label}:${C.reset} ${C.bold}${value}${C.reset}`);
}

// ─── .env loader ──────────────────────────────────────────────────────────────

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  if (!existsSync('.env')) return env;
  const content = readFileSync('.env', 'utf8');
  for (const line of content.split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) {
      env[match[1]] = match[2].replace(/^"|"$/g, '').replace(/^'|'$/g, '');
    }
  }
  return env;
}

const dotenv = loadEnv();

function getEnv(key: string): string {
  return process.env[key] ?? dotenv[key] ?? '';
}

// Set vars in process.env so PrismaClient and encrypt() pick them up
for (const key of ['DATABASE_URL', 'ENCRYPTION_KEY']) {
  if (!process.env[key] && dotenv[key]) {
    process.env[key] = dotenv[key];
  }
}

// ─── Argument parsing ─────────────────────────────────────────────────────────

const DOZALDEVS_TENANT_ID = '00000000-0000-0000-0000-000000000002';

const argv = process.argv.slice(2);
const helpFlag = argv.includes('--help') || argv.includes('-h');

if (helpFlag) {
  console.log(`
${C.bold}register-dev-slack-tenant${C.reset} — Register a dev Slack sandbox workspace with the local platform

${C.bold}Usage:${C.reset}
  pnpm register-dev-slack --team-id T0601SMSVEU --bot-token xoxb-...
  pnpm register-dev-slack --team-id T06KFDGLHS6 --bot-token xoxb-... --tenant-id 00000000-0000-0000-0000-000000000003

${C.bold}Options:${C.reset}
  ${C.cyan}--team-id${C.reset}    <T...>       Slack workspace team ID (required, starts with T)
  ${C.cyan}--bot-token${C.reset}  <xoxb-...>   Slack bot token for the dev app (required, starts with xoxb-)
  ${C.cyan}--tenant-id${C.reset}  <uuid>       Target tenant UUID (optional — defaults to DozalDevs ${DOZALDEVS_TENANT_ID})
  ${C.cyan}--help${C.reset}                   Show this help

${C.bold}What it does:${C.reset}
  1. Upserts a tenant_integrations row: provider='slack', external_id=<teamId>
  2. Upserts a tenant_secrets row: key='slack_bot_token', encrypted value=<botToken>
  3. Verifies the registration by reading back the integration row

${C.bold}After running:${C.reset}
  Set SLACK_APP_TOKEN=xapp-<your-personal-token> in .env and restart pnpm dev.
  The bot will now resolve @mentions from your sandbox workspace.
`);
  process.exit(0);
}

function getArg(flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx !== -1 && argv[idx + 1]) {
    return argv[idx + 1];
  }
  return undefined;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  section('Register Dev Slack Workspace');

  // ── Collect and validate args ─────────────────────────────────────────────

  const teamId = getArg('--team-id');
  const botToken = getArg('--bot-token');
  const tenantId = getArg('--tenant-id') ?? DOZALDEVS_TENANT_ID;

  if (!teamId) {
    fail('--team-id is required (Slack workspace team ID, starts with T)');
    fail('  Example: --team-id T0601SMSVEU');
    process.exit(1);
  }

  if (!teamId.startsWith('T')) {
    fail(`--team-id must start with 'T', got: ${teamId}`);
    process.exit(1);
  }

  if (!botToken) {
    fail('--bot-token is required (Slack bot token, starts with xoxb-)');
    fail('  Example: --bot-token xoxb-1234567890-...');
    process.exit(1);
  }

  if (!botToken.startsWith('xoxb-')) {
    fail(`--bot-token must start with 'xoxb-', got: ${botToken.slice(0, 10)}...`);
    process.exit(1);
  }

  // Validate UUID format
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(tenantId)) {
    fail(`--tenant-id must be a valid UUID, got: ${tenantId}`);
    process.exit(1);
  }

  // Validate env vars
  const encryptionKey = getEnv('ENCRYPTION_KEY');
  if (!encryptionKey || !/^[0-9a-f]{64}$/i.test(encryptionKey)) {
    fail('ENCRYPTION_KEY missing or malformed in .env (must be 64-char hex string)');
    fail('  Run pnpm setup to auto-generate it.');
    process.exit(1);
  }

  const databaseUrl = getEnv('DATABASE_URL');
  if (!databaseUrl) {
    fail('DATABASE_URL missing in .env');
    process.exit(1);
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  const maskedToken = botToken.slice(0, 10) + '...';
  info('Registering dev Slack workspace:');
  status('team_id', teamId);
  status('tenant_id', tenantId);
  status('bot_token', maskedToken);

  // ── Prisma client ─────────────────────────────────────────────────────────

  const prisma = new PrismaClient();

  try {
    // ── 1. Verify tenant exists ───────────────────────────────────────────

    section('Verifying Tenant');

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      fail(`Tenant not found: ${tenantId}`);
      fail('  Is the database seeded? Run: pnpm db:seed');
      process.exit(1);
    }
    ok(`Tenant found: ${tenant.name} (slug: ${tenant.slug})`);

    // ── 2. Upsert slack_integrations ──────────────────────────────────────

    section('Upserting Slack Integration');

    await prisma.tenantIntegration.upsert({
      where: { tenant_id_provider: { tenant_id: tenantId, provider: 'slack' } },
      create: {
        tenant_id: tenantId,
        provider: 'slack',
        external_id: teamId,
        status: 'active',
      },
      update: {
        external_id: teamId,
        status: 'active',
        deleted_at: null,
      },
    });

    ok(`slack_integrations upserted`, `provider=slack, external_id=${teamId}`);

    // ── 3. Upsert tenant_secrets (slack_bot_token, encrypted) ─────────────

    section('Upserting Bot Token Secret');

    const { ciphertext, iv, auth_tag } = encrypt(botToken);
    await prisma.tenantSecret.upsert({
      where: { tenant_id_key: { tenant_id: tenantId, key: 'slack_bot_token' } },
      create: { tenant_id: tenantId, key: 'slack_bot_token', ciphertext, iv, auth_tag },
      update: { ciphertext, iv, auth_tag },
    });

    ok(`tenant_secrets upserted`, `key=slack_bot_token, token=${maskedToken}`);

    // ── 4. Verify by reading back ─────────────────────────────────────────

    section('Verification');

    const integration = await prisma.tenantIntegration.findFirst({
      where: { provider: 'slack', external_id: teamId, deleted_at: null },
    });

    if (!integration) {
      fail('Verification failed — could not read back the slack_integrations row');
      process.exit(1);
    }

    ok('Read-back successful');
    status('integration.id', integration.id);
    status('integration.provider', integration.provider);
    status('integration.external_id', integration.external_id);
    status('integration.status', integration.status);

    // ── 5. Success ────────────────────────────────────────────────────────

    section('Success');
    ok(`Dev Slack workspace registered for tenant ${C.bold}${tenant.name}${C.reset}${C.green}!`);
    console.log();
    info('Next steps:');
    console.log(`  ${C.bold}1.${C.reset} Set your personal app token in .env:`);
    console.log(`       SLACK_APP_TOKEN=xapp-<your-personal-token>`);
    console.log(`  ${C.bold}2.${C.reset} Restart the dev server:`);
    console.log(`       pnpm dev`);
    console.log(
      `  ${C.bold}3.${C.reset} @mention the bot in your sandbox workspace — it should respond.`,
    );
    console.log();
    warn('This registration is idempotent — safe to re-run if the token changes.');
    console.log();
  } finally {
    await prisma.$disconnect();
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

main().catch((err) => {
  fail(`Unhandled error: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) {
    console.error(C.dim + err.stack + C.reset);
  }
  process.exit(1);
});
