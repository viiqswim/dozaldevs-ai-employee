#!/usr/bin/env tsx
/**
 * dev.ts — Unified local dev environment launcher
 *
 * Starts: Docker Compose (Supabase stack) + Inngest Dev Server (:8288) +
 *         Event Gateway (:7700) + Cloudflare named tunnel (local-ai-employee.dozaldevs.com)
 *         + Docker worker image build (skippable)
 *
 * Usage:
 *   npx tsx scripts/dev.ts [--reset] [--skip-build] [--no-tunnel] [--help]
 *
 * Options:
 *   --reset       Wipe database and re-seed before starting
 *   --skip-build  Skip Docker worker image build (for fast restarts)
 *   --no-tunnel   Skip Cloudflare tunnel (auto-detected if cloudflared is absent)
 *   --help        Show this help message
 */

import { $ } from 'zx';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import fs, { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDecipheriv } from 'node:crypto';

$.verbose = false;

// ─────────────────────────────────────────────────────
// Color helpers
// ─────────────────────────────────────────────────────
const C = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

const log = (msg: string) => console.log(msg);
const ok = (msg: string) => log(`  ${C.green}✓${C.reset} ${msg}`);
const fail = (msg: string) => log(`  ${C.red}✗${C.reset} ${msg}`);
const info = (msg: string) => log(`  ${C.cyan}→${C.reset} ${msg}`);
const warn = (msg: string) => log(`  ${C.yellow}⚠${C.reset}  ${msg}`);
const serviceLog = (name: string, color: string) => (d: Buffer) =>
  process.stdout.write(`${color}[${name}]${C.reset} ${d}`);

// ─────────────────────────────────────────────────────
// Parse flags
// ─────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes('--help')) {
  log('');
  log('Usage: tsx scripts/dev.ts [--reset] [--skip-build] [--no-tunnel] [--help]');
  log('');
  log('Starts the full AI Employee platform locally:');
  log('  • Docker Compose (Supabase stack)');
  log('  • Inngest Dev Server (:8288)');
  log('  • Event Gateway (:7700) with Slack Socket Mode');
  log('  • Cloudflare tunnel (local-ai-employee.dozaldevs.com → :7700)');
  log('  • Docker worker image build (default, skip with --skip-build)');
  log('  • Hostfully webhook auto-registration (non-fatal if missing secrets)');
  log('');
  log('Fly.io hybrid mode (WORKER_RUNTIME=fly in .env):');
  log('  • If TUNNEL_URL is a stable URL (not trycloudflare.com), it is used directly');
  log('  • Otherwise a PostgREST quick tunnel is auto-started (cloudflared → localhost:54331)');
  log('  • Gateway receives WORKER_RUNTIME=fly so workers dispatch to Fly.io');
  log('');
  log('Options:');
  log('  --reset       Wipe database and re-seed before starting');
  log('  --skip-build  Skip Docker worker image build (for fast restarts)');
  log('  --no-tunnel   Skip Cloudflare tunnel (auto-detected if cloudflared is absent)');
  log('  --help        Show this help message');
  log('');
  log('Examples:');
  log('  pnpm dev                   # full start (build + tunnel)');
  log('  pnpm dev --skip-build      # skip Docker build for fast restart');
  log('  pnpm dev --reset           # wipe DB, re-seed, then start');
  log('  pnpm dev --no-tunnel       # start without Cloudflare tunnel');
  log('');
  process.exit(0);
}

const KNOWN_FLAGS = ['--reset', '--skip-build', '--no-tunnel', '--help'];
for (const arg of args) {
  if (!KNOWN_FLAGS.includes(arg)) {
    log(`Unknown flag: ${arg}`);
    log('Usage: tsx scripts/dev.ts [--reset] [--skip-build] [--no-tunnel] [--help]');
    process.exit(1);
  }
}

const resetFlag = args.includes('--reset');
const skipBuildFlag = args.includes('--skip-build');
const noTunnelFlag = args.includes('--no-tunnel');

// ─────────────────────────────────────────────────────
// Load .env into process.env (skip already-set vars)
// ─────────────────────────────────────────────────────
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

// ─────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────
const GATEWAY_PORT = process.env.PORT ?? '7700';
const TUNNEL_CONFIG = path.join(os.homedir(), '.cloudflared/ai-employee-local.yml');
const TUNNEL_CREDS = path.join(
  os.homedir(),
  '.cloudflared/e160ac6d-2d7d-47c4-a552-b13700947d29.json',
);
const TUNNEL_URL = 'https://local-ai-employee.dozaldevs.com';
const CLOUDFLARED_LOG = '/tmp/cloudflared.log';

// ─────────────────────────────────────────────────────
// Track child processes for cleanup
// ─────────────────────────────────────────────────────
const children: ChildProcess[] = [];
let cleaningUp = false;

async function cleanup(): Promise<void> {
  if (cleaningUp) return;
  cleaningUp = true;
  log('');
  log('Shutting down services...');

  // Stop any running worker containers spawned by lifecycle steps
  try {
    const containers = execSync(
      'docker ps --filter ancestor=ai-employee-worker:latest --format "{{.Names}}" 2>/dev/null || true',
      { encoding: 'utf8' },
    ).trim();
    if (containers) {
      log(`Stopping worker containers: ${containers.replace(/\n/g, ', ')}`);
      execSync(`docker stop ${containers.replace(/\n/g, ' ')} 2>/dev/null || true`, {
        encoding: 'utf8',
      });
    }
  } catch {
    /* Docker may not be available — ignore */
  }

  for (const child of children) {
    try {
      if (child.pid) process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* ignore */
    }
  }
  await new Promise<void>((r) => setTimeout(r, 1000));
  log('Shutdown complete.');
  process.exit(0);
}

process.on('SIGINT', () => {
  void cleanup();
});
process.on('SIGTERM', () => {
  void cleanup();
});

// ─────────────────────────────────────────────────────
// Health check with retry loop
// ─────────────────────────────────────────────────────
async function waitForHttp(url: string, maxWaitMs = 30_000, intervalMs = 2_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      await $`curl -s -o /dev/null -w "%{http_code}" ${url}`;
      return true;
    } catch {
      /* not ready yet */
    }
    await new Promise<void>((r) => setTimeout(r, intervalMs));
    const elapsed = Math.round((Date.now() - start) / 1000);
    log(`  ... waiting (${elapsed}s)`);
  }
  return false;
}

// ─────────────────────────────────────────────────────
// Decrypt helper (AES-256-GCM, matches src/lib/encryption.ts)
// ─────────────────────────────────────────────────────
function decryptSecret(ciphertext: string, iv: string, authTag: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const ivBuf = Buffer.from(iv, 'base64');
  const authTagBuf = Buffer.from(authTag, 'base64');
  const ctBuf = Buffer.from(ciphertext, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, ivBuf);
  decipher.setAuthTag(authTagBuf);
  return decipher.update(ctBuf).toString() + decipher.final('utf8');
}

// ─────────────────────────────────────────────────────
// Opening banner
// ─────────────────────────────────────────────────────
log('');
log('╔══════════════════════════════════════════════════╗');
log('║   Local Full-Stack Environment — Starting       ║');
log('╚══════════════════════════════════════════════════╝');
log('');

// ─────────────────────────────────────────────────────
// Step 1: Pre-flight checks
// ─────────────────────────────────────────────────────
log('── Step 1: Pre-flight checks ──');

let prereqFail = false;
let tunnelAvailable = true;

// Docker daemon
try {
  await $`docker info`;
  ok('Docker daemon is running');
} catch {
  fail('Docker daemon is not running — start Docker Desktop first');
  prereqFail = true;
}

// Docker Compose
try {
  await $`docker compose version`;
  ok('Docker Compose available');
} catch {
  fail('Docker Compose not found — install Docker Desktop or the Compose plugin');
  prereqFail = true;
}

// Required env vars
const REQUIRED_VARS = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'INNGEST_EVENT_KEY',
  'INNGEST_SIGNING_KEY',
  'ADMIN_API_KEY',
  'ENCRYPTION_KEY',
  'SLACK_APP_TOKEN',
  'SLACK_SIGNING_SECRET',
  'OPENROUTER_API_KEY',
] as const;

for (const v of REQUIRED_VARS) {
  if (process.env[v]) {
    ok(`${v} is set`);
  } else {
    fail(`${v} is not set — add it to .env`);
    prereqFail = true;
  }
}

// cloudflared binary
try {
  await $`which cloudflared`;
  ok('cloudflared found');
} catch {
  warn(
    'cloudflared not found — tunnel will be skipped. Install: brew install cloudflare/cloudflare/cloudflared',
  );
  tunnelAvailable = false;
}

// Tunnel config file
if (!existsSync(TUNNEL_CONFIG)) {
  warn(`Tunnel config not found: ${TUNNEL_CONFIG} — tunnel will be skipped`);
  tunnelAvailable = false;
} else {
  ok('Tunnel config found');
}

// Tunnel credentials file
if (!existsSync(TUNNEL_CREDS)) {
  warn(`Tunnel credentials not found: ${TUNNEL_CREDS} — tunnel will be skipped`);
  tunnelAvailable = false;
} else {
  ok('Tunnel credentials found');
}

if (prereqFail) {
  log('');
  log('  Prerequisites failed. Fix issues above and re-run.');
  process.exit(1);
}
log('');

// ─────────────────────────────────────────────────────
// Step 2: Docker image build
// ─────────────────────────────────────────────────────
log('── Step 2: Docker image build ──');
if (skipBuildFlag) {
  info('Skipping Docker image build (--skip-build)');
  // Check if image exists at all — warn if not
  try {
    await $`docker image inspect ai-employee-worker:latest`;
    ok('ai-employee-worker:latest image exists');
  } catch {
    warn(
      'No ai-employee-worker:latest image found — workers will fail to dispatch. Run without --skip-build first.',
    );
  }
} else {
  info('Building Docker worker image...');
  $.verbose = true;
  try {
    await $`docker build -t ai-employee-worker:latest .`;
  } catch {
    $.verbose = false;
    fail('Docker build failed');
    process.exit(1);
  }
  $.verbose = false;
  ok('Docker image built: ai-employee-worker:latest');
}
log('');

// ─────────────────────────────────────────────────────
// Step 3: DB Reset (only when --reset flag passed)
// ─────────────────────────────────────────────────────
if (resetFlag) {
  log('── Step 3: Resetting DB (--reset flag) ──');
  log('  Stopping Docker Compose and removing volumes...');
  $.verbose = true;
  await $`docker compose -f docker/supabase-services.yml --env-file docker/.env down -v`;
  log('  Starting Docker Compose fresh...');
  await $`docker compose -f docker/supabase-services.yml --env-file docker/.env up -d`;
  $.verbose = false;

  // Wait for PostgreSQL to be ready before running migrations
  log('  Waiting for database to be ready...');
  let dbReady = false;
  for (let i = 0; i < 24; i++) {
    await new Promise<void>((r) => setTimeout(r, 5000));
    try {
      await $`PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT 1" -q`;
      dbReady = true;
      break;
    } catch {
      log(`  ... waiting for DB (${(i + 1) * 5}s)`);
    }
  }

  if (!dbReady) {
    fail('Database not ready after 120s');
    process.exit(1);
  }

  $.verbose = true;
  await $`pnpm prisma migrate deploy`;
  await $`pnpm prisma db seed`;
  $.verbose = false;
  ok('Database reset complete');
  log('');
}

// ─────────────────────────────────────────────────────
// Step 4: Start Docker Compose Services
// ─────────────────────────────────────────────────────
log('── Step 4: Starting Docker Compose Services ──');

try {
  await $`supabase stop`;
  log('  Stopped Supabase CLI containers');
} catch {
  /* Supabase CLI not running or not installed — OK */
}

if (!existsSync('docker/.env')) {
  if (existsSync('docker/.env.example')) {
    writeFileSync('docker/.env', readFileSync('docker/.env.example', 'utf8'));
    info('docker/.env created from docker/.env.example');
  }
}

let servicesRunning = false;
try {
  const result =
    await $`docker compose -f docker/supabase-services.yml --env-file docker/.env ps --format json`;
  const containers = result.stdout.trim().split('\n').filter(Boolean);
  servicesRunning = containers.length > 0;
} catch {
  /* not running */
}

if (!servicesRunning) {
  info('Starting Docker Compose services...');
  try {
    $.verbose = true;
    await $`docker compose -f docker/supabase-services.yml --env-file docker/.env up -d`;
    $.verbose = false;
    ok('Docker Compose services started');
  } catch {
    $.verbose = false;
    fail('Failed to start Docker Compose services');
    process.exit(1);
  }
} else {
  ok('Docker Compose services already running — skipping start');
}

info('Running Prisma migrations...');
try {
  await $`pnpm prisma migrate deploy`;
} catch {
  /* already up-to-date */
}
ok('Migrations complete (or already up-to-date)');

const checkSql =
  "SELECT notification_channel FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000015'";
try {
  const checkResult =
    await $`PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -A -c ${checkSql}`;
  const val = checkResult.stdout.trim();
  if (!val || val === '' || val.toLowerCase() === 'null') {
    const updateSql =
      "UPDATE archetypes SET notification_channel = 'C0AMGJQN05S' WHERE id = '00000000-0000-0000-0000-000000000015'";
    await $`PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c ${updateSql}`;
    ok('VLRE guest-messaging archetype: notification_channel set to C0AMGJQN05S');
  } else {
    ok(`VLRE guest-messaging archetype: notification_channel = ${val}`);
  }
} catch {
  /* archetype row may not exist yet — seed will handle it */
}
log('');

log('── Step 4b: Waiting for Docker Compose services (up to 120s) ──');
const supabaseReady = await waitForHttp('http://localhost:54331/rest/v1/', 120_000);
if (!supabaseReady) {
  fail('Docker Compose services did not become healthy after 120s');
  process.exit(1);
}
ok('Docker Compose services healthy at http://localhost:54331');
log('');

// ─────────────────────────────────────────────────────
// Step 4c: PostgREST Supabase Tunnel (Fly.io hybrid mode)
// ─────────────────────────────────────────────────────
if (process.env.WORKER_RUNTIME === 'fly') {
  log('── Step 4c: PostgREST Supabase Tunnel (Fly.io hybrid mode) ──');

  const existingTunnelUrl = process.env.TUNNEL_URL?.trim();
  const isStableUrl = existingTunnelUrl && !existingTunnelUrl.includes('trycloudflare.com');

  if (isStableUrl) {
    ok(
      `PostgREST tunnel: using stable URL from TUNNEL_URL (skipping quick tunnel): ${existingTunnelUrl}`,
    );
  } else {
    let postgrestTunnelAlive = false;

    if (existingTunnelUrl) {
      try {
        const r =
          await $`curl -s --max-time 5 -o /dev/null -w "%{http_code}" ${existingTunnelUrl}/rest/v1/`;
        const code = parseInt(r.stdout.trim(), 10);
        postgrestTunnelAlive = code >= 200 && code < 500;
      } catch {
        /* dead or unreachable */
      }
    }

    if (postgrestTunnelAlive) {
      ok(`Existing PostgREST tunnel alive: ${existingTunnelUrl}`);
    } else {
      info('Starting PostgREST quick tunnel...');
      const postgrestTunnelLog = '/tmp/postgrest-tunnel.log';
      const tunnelLogStream = fs.createWriteStream(postgrestTunnelLog);

      const postgrestProc = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:54331'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });
      postgrestProc.stdout?.pipe(tunnelLogStream);
      postgrestProc.stderr?.pipe(tunnelLogStream);
      children.push(postgrestProc);

      const newTunnelUrl = await new Promise<string | null>((resolve) => {
        const timeout = setTimeout(() => resolve(null), 30_000);
        const urlPattern = /https:\/\/\S+\.trycloudflare\.com/;

        function scan(data: Buffer): void {
          const match = data.toString().match(urlPattern);
          if (match) {
            clearTimeout(timeout);
            resolve(match[0]);
          }
        }

        postgrestProc.stdout?.on('data', scan);
        postgrestProc.stderr?.on('data', scan);
      });

      if (!newTunnelUrl) {
        warn(`PostgREST tunnel URL not captured within 30s — logs at ${postgrestTunnelLog}`);
      } else {
        const envPath = '.env';
        const envContent = readFileSync(envPath, 'utf8');
        const updated = envContent.match(/^TUNNEL_URL=/m)
          ? envContent.replace(/^TUNNEL_URL=.*/m, `TUNNEL_URL=${newTunnelUrl}`)
          : `${envContent}\nTUNNEL_URL=${newTunnelUrl}`;
        writeFileSync(envPath, updated);
        process.env.TUNNEL_URL = newTunnelUrl;
        ok(`PostgREST tunnel: ${newTunnelUrl} (updated .env)`);
      }
    }
  }
  log('');
}

// ─────────────────────────────────────────────────────
// Step 5: Start Inngest Dev Server
// ─────────────────────────────────────────────────────
log('── Step 5: Starting Inngest Dev Server ──');

const inngestProc = spawn(
  'npx',
  [
    'inngest-cli@1.21.0',
    'dev',
    '-u',
    `http://localhost:${GATEWAY_PORT}/api/inngest`,
    '--port',
    '8288',
  ],
  { stdio: 'pipe', detached: true },
);
children.push(inngestProc);

inngestProc.stdout?.on('data', serviceLog('inngest', C.blue));
inngestProc.stderr?.on('data', serviceLog('inngest', C.blue));
inngestProc.on('exit', (code) => {
  if (!cleaningUp) log(`${C.yellow}[inngest] exited with code ${code}${C.reset}`);
});

ok(`Inngest Dev Server started (PID: ${inngestProc.pid})`);
log('');

log('── Step 5b: Waiting for Inngest health (up to 30s) ──');
const inngestReady = await waitForHttp('http://localhost:8288/', 30_000);
if (!inngestReady) {
  fail('Inngest Dev Server did not become healthy after 30s');
  await cleanup();
  process.exit(1);
}
ok('Inngest Dev Server is healthy at http://localhost:8288');
log('');

// ─────────────────────────────────────────────────────
// Step 6: Start Event Gateway
// ─────────────────────────────────────────────────────
log('── Step 6: Starting Event Gateway ──');

const gatewayEnv: NodeJS.ProcessEnv = {
  ...process.env,
  WORKER_RUNTIME: process.env.WORKER_RUNTIME || 'docker',
};

const gatewayProc = spawn(
  'npx',
  ['tsx', 'watch', '--clear-screen=false', 'src/gateway/server.ts'],
  {
    stdio: 'pipe',
    detached: true,
    env: gatewayEnv,
  },
);
children.push(gatewayProc);

gatewayProc.stdout?.on('data', serviceLog('gateway', C.cyan));
gatewayProc.stderr?.on('data', serviceLog('gateway', C.cyan));
gatewayProc.on('exit', (code) => {
  if (!cleaningUp) log(`${C.yellow}[gateway] exited with code ${code}${C.reset}`);
});

ok(`Event Gateway started (PID: ${gatewayProc.pid})`);
log('');

log('── Step 6b: Waiting for Gateway health (up to 30s) ──');
const gatewayReady = await waitForHttp(`http://localhost:${GATEWAY_PORT}/health`, 30_000);
if (!gatewayReady) {
  fail('Event Gateway did not become healthy after 30s');
  await cleanup();
  process.exit(1);
}
ok(`Event Gateway is healthy at http://localhost:${GATEWAY_PORT}`);
log('');

// ─────────────────────────────────────────────────────
// Step 6c-watch: Worker file change warnings
// ─────────────────────────────────────────────────────
let workerWarnDebounce: ReturnType<typeof setTimeout> | null = null;
const watchWorkerDirs = (dir: string) => {
  if (!existsSync(dir)) return;
  fs.watch(dir, { recursive: true }, () => {
    if (workerWarnDebounce) clearTimeout(workerWarnDebounce);
    workerWarnDebounce = setTimeout(() => {
      warn('Worker files changed — run `docker build -t ai-employee-worker:latest .` to apply');
    }, 500);
  });
};
watchWorkerDirs('src/workers');

let workerToolsInfoDebounce: ReturnType<typeof setTimeout> | null = null;
if (existsSync('src/worker-tools')) {
  fs.watch('src/worker-tools', { recursive: true }, () => {
    if (workerToolsInfoDebounce) clearTimeout(workerToolsInfoDebounce);
    workerToolsInfoDebounce = setTimeout(() => {
      info(
        'Worker tools changed — changes are live in the next task run (no Docker rebuild needed)',
      );
    }, 500);
  });
}

// ─────────────────────────────────────────────────────
// Step 6c: Hostfully webhook registration
// ─────────────────────────────────────────────────────
log('── Step 6c: Hostfully webhook registration ──');
if (noTunnelFlag || !tunnelAvailable) {
  info('Hostfully webhook registration skipped — no tunnel');
  log('');
} else {
  try {
    const encKey = process.env.ENCRYPTION_KEY ?? '';
    const webhookPublicUrl = process.env.WEBHOOK_PUBLIC_URL;

    if (!encKey || !webhookPublicUrl) {
      warn(
        'ENCRYPTION_KEY or WEBHOOK_PUBLIC_URL not set — skipping Hostfully webhook registration',
      );
    } else {
      const secretsSql =
        "SELECT key, ciphertext, iv, auth_tag FROM tenant_secrets WHERE tenant_id = '00000000-0000-0000-0000-000000000003' AND key IN ('hostfully_api_key', 'hostfully_agency_uid')";
      const secretsResult =
        await $`PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -A -F '|' -c ${secretsSql}`;

      const secrets: Record<string, string> = {};
      for (const row of secretsResult.stdout.trim().split('\n')) {
        const parts = row.split('|').map((p) => p.trim());
        if (parts.length === 4 && parts[0]) {
          const [key, ciphertext, iv, authTag] = parts;
          try {
            secrets[key] = decryptSecret(ciphertext, iv, authTag, encKey);
          } catch {
            /* skip rows that fail to decrypt */
          }
        }
      }

      const apiKey = secrets['hostfully_api_key'];
      const agencyUid = secrets['hostfully_agency_uid'];

      if (!apiKey || !agencyUid) {
        warn('Hostfully secrets not found in DB — skipping webhook registration');
      } else {
        const baseUrl = 'https://api.hostfully.com/api/v3.2';
        const callbackUrl = `${webhookPublicUrl}/webhooks/hostfully`;

        const listRes = await fetch(
          `${baseUrl}/webhooks?agencyUid=${encodeURIComponent(agencyUid)}`,
          { headers: { 'X-HOSTFULLY-APIKEY': apiKey, 'Content-Type': 'application/json' } },
        );

        if (listRes.ok) {
          const data = (await listRes.json()) as {
            webhooks?: Array<{ uid: string; eventType: string; callbackUrl: string }>;
          };
          const alreadyRegistered = (data.webhooks ?? []).find(
            (w) => w.eventType === 'NEW_INBOX_MESSAGE' && w.callbackUrl === callbackUrl,
          );

          if (alreadyRegistered) {
            ok(`Hostfully webhook already registered (${alreadyRegistered.uid}) — skipping`);
          } else {
            const regRes = await fetch(`${baseUrl}/webhooks`, {
              method: 'POST',
              headers: { 'X-HOSTFULLY-APIKEY': apiKey, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                agencyUid,
                eventType: 'NEW_INBOX_MESSAGE',
                callbackUrl,
                webhookType: 'POST_JSON',
                objectUid: agencyUid,
              }),
            });

            if (regRes.ok) {
              const regData = (await regRes.json()) as { webhook?: { uid: string } };
              ok(`Hostfully webhook registered (${regData.webhook?.uid ?? 'unknown'})`);
            } else {
              warn(`Hostfully webhook registration failed (${regRes.status}) — non-fatal`);
            }
          }
        } else {
          warn(`Could not list Hostfully webhooks (${listRes.status}) — skipping registration`);
        }
      }
    }
  } catch (err) {
    warn(`Hostfully webhook registration error: ${(err as Error).message} — non-fatal`);
  }
  log('');
}

// ─────────────────────────────────────────────────────
// Step 7: Cloudflare Tunnel
// ─────────────────────────────────────────────────────
log('── Step 7: Cloudflare Tunnel ──');
if (!noTunnelFlag && tunnelAvailable) {
  // Check if tunnel already routing — must parse HTTP status, not just curl exit code.
  // Cloudflare CDN always responds (HTTP 530 for disconnected tunnels); curl exits 0.
  let tunnelAlreadyActive = false;
  try {
    const tunnelCheckResult =
      await $`curl -s --max-time 5 -o /dev/null -w "%{http_code}" ${TUNNEL_URL}/health`;
    const statusCode = parseInt(tunnelCheckResult.stdout.trim(), 10);
    tunnelAlreadyActive = statusCode >= 200 && statusCode < 300;
  } catch {
    /* tunnel not up */
  }

  if (tunnelAlreadyActive) {
    ok('Tunnel already active — skipping cloudflared spawn');
  } else {
    // Tunnel not up — spawn cloudflared
    const logStream = fs.createWriteStream(CLOUDFLARED_LOG);
    const cfStart = Date.now();
    const cfProc = spawn('cloudflared', ['tunnel', '--config', TUNNEL_CONFIG, 'run'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });
    cfProc.stdout?.pipe(logStream);
    cfProc.stderr?.pipe(logStream);
    children.push(cfProc);

    cfProc.on('exit', (code) => {
      if (!cleaningUp && Date.now() - cfStart < 5000) {
        fail(
          `cloudflared exited immediately (code ${code}). Check /tmp/cloudflared.log for details.`,
        );
        void cleanup().then(() => process.exit(1));
      } else if (!cleaningUp) {
        log(`${C.yellow}[cloudflared] exited with code ${code}${C.reset}`);
      }
    });

    ok(`cloudflared started (PID: ${cfProc.pid}) — logs at ${CLOUDFLARED_LOG}`);
    log('');
    log('── Step 7b: Waiting for tunnel to route (up to 60s) ──');
    const tunnelReady = await waitForHttp(`${TUNNEL_URL}/health`, 60_000);
    if (!tunnelReady) {
      fail(`Tunnel not routing after 60s. Check /tmp/cloudflared.log`);
      await cleanup();
      process.exit(1);
    }
    ok(`Tunnel healthy at ${TUNNEL_URL}`);
  }
} else {
  info('Tunnel skipped' + (noTunnelFlag ? ' (--no-tunnel)' : ' (cloudflared not configured)'));
}
log('');

// ─────────────────────────────────────────────────────
// Step 8: Start Dashboard Dev Server (Vite + HMR)
// ─────────────────────────────────────────────────────
log('── Step 8: Starting Dashboard Dev Server ──');

const DASHBOARD_PORT = 7701;
const dashboardProc = spawn('pnpm', ['dev', '--port', String(DASHBOARD_PORT)], {
  cwd: path.resolve(process.cwd(), 'dashboard'),
  stdio: 'pipe',
  detached: true,
});
children.push(dashboardProc);

dashboardProc.stdout?.on('data', serviceLog('dashboard', C.green));
dashboardProc.stderr?.on('data', serviceLog('dashboard', C.green));
dashboardProc.on('exit', (code) => {
  if (!cleaningUp) log(`${C.yellow}[dashboard] exited with code ${code}${C.reset}`);
});

ok(`Dashboard dev server started (PID: ${dashboardProc.pid})`);
log('');

log('── Step 8b: Waiting for Dashboard dev server (up to 30s) ──');
const dashboardReady = await waitForHttp(`http://localhost:${DASHBOARD_PORT}/dashboard/`, 30_000);
if (!dashboardReady) {
  warn('Dashboard dev server did not become healthy after 30s — continuing anyway');
} else {
  ok(`Dashboard dev server is healthy at http://localhost:${DASHBOARD_PORT}/dashboard/`);
}
log('');

// ─────────────────────────────────────────────────────
// Summary banner
// ─────────────────────────────────────────────────────
log('╔══════════════════════════════════════════════════╗');
log('║      Local Full-Stack Environment Ready         ║');
log('╚══════════════════════════════════════════════════╝');
log(`  PostgREST:  http://localhost:54331`);
log(`  Studio:     http://localhost:54323`);
log(`  Inngest:    http://localhost:8288`);
log(`  Gateway:    http://localhost:${GATEWAY_PORT} (auto-restart enabled)`);
log(`  Dashboard:  http://localhost:${DASHBOARD_PORT}/dashboard/ (HMR enabled)`);
if (!noTunnelFlag && tunnelAvailable) {
  log(`  Tunnel:     ${TUNNEL_URL}`);
}
if (process.env.WORKER_RUNTIME === 'fly') {
  log(`  PostgREST Tunnel: ${process.env.TUNNEL_URL ?? '(not captured)'} [Fly.io hybrid mode]`);
}
log('');
log('  Slack webhooks route through the tunnel automatically.');
log(`  Trigger a task:  curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" \\`);
log(`    "http://localhost:${GATEWAY_PORT}/admin/tenants/<id>/employees/daily-summarizer/trigger"`);
log('');
log('  Press Ctrl+C to stop all services.');
log('');

// Block until Ctrl+C (SIGINT/SIGTERM handled above)
await new Promise<void>(() => {});
