#!/usr/bin/env tsx
/**
 * dev-local.ts — Launch full AI Employee platform locally with Cloudflare named tunnel
 *
 * Starts: Docker Compose (Supabase stack) + Inngest Dev Server (:8288) +
 *         Event Gateway (:7700) + Cloudflare named tunnel (local-ai-employee.dozaldevs.com)
 *         + Docker worker image build (skippable)
 *
 * Usage:
 *   npx tsx scripts/dev-local.ts [--reset] [--skip-build] [--help]
 *
 * Options:
 *   --reset       Wipe database and re-seed before starting
 *   --skip-build  Skip Docker worker image build (for fast restarts)
 *   --help        Show this help message
 */

import { $ } from 'zx';
import { spawn, type ChildProcess } from 'node:child_process';
import fs, { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

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
  log('Usage: tsx scripts/dev-local.ts [--reset] [--skip-build] [--help]');
  log('');
  log('Starts the full AI Employee platform locally:');
  log('  • Docker Compose (Supabase stack)');
  log('  • Inngest Dev Server (:8288)');
  log('  • Event Gateway (:7700) with Slack Socket Mode');
  log('  • Cloudflare tunnel (local-ai-employee.dozaldevs.com → :7700)');
  log('  • Docker worker image build (default, skip with --skip-build)');
  log('');
  log('Options:');
  log('  --reset       Wipe database and re-seed before starting');
  log('  --skip-build  Skip Docker worker image build (for fast restarts)');
  log('  --help        Show this help message');
  log('');
  log('Examples:');
  log('  pnpm dev:local                   # full start (build + tunnel)');
  log('  pnpm dev:local --skip-build      # skip Docker build for fast restart');
  log('  pnpm dev:local --reset           # wipe DB, re-seed, then start');
  log('');
  process.exit(0);
}

const KNOWN_FLAGS = ['--reset', '--skip-build', '--help'];
for (const arg of args) {
  if (!KNOWN_FLAGS.includes(arg)) {
    log(`Unknown flag: ${arg}`);
    log('Usage: tsx scripts/dev-local.ts [--reset] [--skip-build] [--help]');
    process.exit(1);
  }
}

const resetFlag = args.includes('--reset');
const skipBuildFlag = args.includes('--skip-build');

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
  for (const child of children) {
    try {
      child.kill('SIGTERM');
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
  fail('cloudflared not found — install: brew install cloudflare/cloudflare/cloudflared');
  prereqFail = true;
}

// Tunnel config file
if (!existsSync(TUNNEL_CONFIG)) {
  fail(`Tunnel config not found: ${TUNNEL_CONFIG}`);
  prereqFail = true;
} else {
  ok('Tunnel config found');
}

// Tunnel credentials file
if (!existsSync(TUNNEL_CREDS)) {
  fail(`Tunnel credentials not found: ${TUNNEL_CREDS}`);
  prereqFail = true;
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
  await $`docker compose -f docker/docker-compose.yml down -v`;
  log('  Starting Docker Compose fresh...');
  await $`docker compose -f docker/docker-compose.yml up -d`;
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
  const result = await $`docker compose -f docker/docker-compose.yml ps --format json`;
  const containers = result.stdout.trim().split('\n').filter(Boolean);
  servicesRunning = containers.length > 0;
} catch {
  /* not running */
}

if (!servicesRunning) {
  info('Starting Docker Compose services...');
  try {
    $.verbose = true;
    await $`docker compose -f docker/docker-compose.yml up -d`;
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
log('');

log('── Step 4b: Waiting for Docker Compose services (up to 120s) ──');
const supabaseReady = await waitForHttp('http://localhost:54321/rest/v1/', 120_000);
if (!supabaseReady) {
  fail('Docker Compose services did not become healthy after 120s');
  process.exit(1);
}
ok('Docker Compose services healthy at http://localhost:54321');
log('');

// ─────────────────────────────────────────────────────
// Step 5: Start Inngest Dev Server
// ─────────────────────────────────────────────────────
log('── Step 5: Starting Inngest Dev Server ──');

const inngestProc = spawn(
  'npx',
  [
    'inngest-cli@latest',
    'dev',
    '-u',
    `http://localhost:${GATEWAY_PORT}/api/inngest`,
    '--port',
    '8288',
  ],
  { stdio: 'pipe', detached: false },
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

// Merge process.env (which already has .env loaded) with critical overrides:
//   USE_FLY_HYBRID=0  — .env may have USE_FLY_HYBRID=1 for remote mode; force local dispatch
//   USE_LOCAL_DOCKER=1 — ensure worker containers dispatch to local Docker
const gatewayEnv: NodeJS.ProcessEnv = {
  ...process.env,
  USE_LOCAL_DOCKER: '1',
  USE_FLY_HYBRID: '0',
};

const gatewayProc = spawn('node', ['--import', 'tsx/esm', 'src/gateway/server.ts'], {
  stdio: 'pipe',
  detached: false,
  env: gatewayEnv,
});
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
// Step 7: Start Cloudflare Tunnel
// ─────────────────────────────────────────────────────
log('── Step 7: Starting Cloudflare Tunnel ──');

// Check if tunnel already routing
let tunnelAlreadyActive = false;
try {
  await $`curl -s --max-time 5 -o /dev/null -w "%{http_code}" ${TUNNEL_URL}/health`;
  tunnelAlreadyActive = true;
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
log('');

// ─────────────────────────────────────────────────────
// Summary banner
// ─────────────────────────────────────────────────────
log('╔══════════════════════════════════════════════════╗');
log('║      Local Full-Stack Environment Ready         ║');
log('╚══════════════════════════════════════════════════╝');
log(`  PostgREST:  http://localhost:54321`);
log(`  Studio:     http://localhost:54323`);
log(`  Inngest:    http://localhost:8288`);
log(`  Gateway:    http://localhost:${GATEWAY_PORT}`);
log(`  Tunnel:     ${TUNNEL_URL}`);
log('');
log('  Slack webhooks route through the tunnel automatically.');
log(`  Trigger a task:  curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" \\`);
log(`    "http://localhost:${GATEWAY_PORT}/admin/tenants/<id>/employees/daily-summarizer/trigger"`);
log('');
log('  Press Ctrl+C to stop all services.');
log('');

// Block until Ctrl+C (SIGINT/SIGTERM handled above)
await new Promise<void>(() => {});
