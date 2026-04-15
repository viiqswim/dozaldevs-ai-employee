#!/usr/bin/env tsx
/**
 * dev-start.ts — Launch all local E2E services in order with health checks
 *
 * Starts: Supabase (or verifies running) + Inngest Dev Server (:8288) + Gateway (:3000)
 *
 * Usage:
 *   npx tsx scripts/dev-start.ts [--reset]
 *
 * Options:
 *   --reset    Reset database and re-seed before starting services
 */

import { $ } from 'zx';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

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

// ─────────────────────────────────────────────────────
// Parse flags
// ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
for (const arg of args) {
  if (arg !== '--reset') {
    log(`Unknown flag: ${arg}`);
    log(`Usage: tsx scripts/dev-start.ts [--reset]`);
    process.exit(1);
  }
}
const resetFlag = args.includes('--reset');

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
// Banner
// ─────────────────────────────────────────────────────
log('');
log('╔══════════════════════════════════════════════════╗');
log('║     Local E2E Dev Environment — Starting        ║');
log('╚══════════════════════════════════════════════════╝');
log('');

// ─────────────────────────────────────────────────────
// Step 1: Prerequisites check
// ─────────────────────────────────────────────────────
log('── Step 1: Prerequisites check ──');

let prereqFail = false;

// Docker daemon (docker info is more reliable than `which docker`)
try {
  await $`docker info`;
  ok('Docker daemon is running');
} catch {
  fail('Docker daemon is not running — start Docker Desktop first');
  prereqFail = true;
}

try {
  await $`docker compose version`;
  ok('Docker Compose available');
} catch {
  fail('Docker Compose not found — install Docker Desktop or the Compose plugin');
  prereqFail = true;
}

const REQUIRED_VARS = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'JIRA_WEBHOOK_SECRET',
  'INNGEST_EVENT_KEY',
  'INNGEST_SIGNING_KEY',
  'OPENROUTER_API_KEY',
  'GITHUB_TOKEN',
] as const;

for (const v of REQUIRED_VARS) {
  if (process.env[v]) {
    ok(`${v} is set`);
  } else {
    fail(`${v} is not set — add it to .env`);
    prereqFail = true;
  }
}

if (prereqFail) {
  log('');
  log('  Prerequisites failed. Fix issues above and re-run.');
  process.exit(1);
}
log('');

// ─────────────────────────────────────────────────────
// Step 2: DB Reset (only when --reset flag passed)
// ─────────────────────────────────────────────────────
if (resetFlag) {
  log('── Step 2: Resetting DB (--reset flag) ──');
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
// Step 3: Start Supabase (skip if already running)
// ─────────────────────────────────────────────────────
log('── Step 3: Starting Docker Compose Services ──');

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

// ─────────────────────────────────────────────────────
// Step 4: Wait for Supabase health (up to 60s)
// ─────────────────────────────────────────────────────
log('── Step 4: Waiting for Docker Compose services (up to 120s) ──');
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
  ['inngest-cli@latest', 'dev', '-u', 'http://localhost:3000/api/inngest', '--port', '8288'],
  { stdio: 'pipe', detached: false },
);
children.push(inngestProc);

inngestProc.stdout?.on('data', (d: Buffer) =>
  process.stdout.write(`${C.blue}[inngest]${C.reset} ${d}`),
);
inngestProc.stderr?.on('data', (d: Buffer) =>
  process.stderr.write(`${C.blue}[inngest]${C.reset} ${d}`),
);
inngestProc.on('exit', (code) => {
  if (!cleaningUp) log(`${C.yellow}[inngest] exited with code ${code}${C.reset}`);
});

ok(`Inngest Dev Server started (PID: ${inngestProc.pid})`);
log('');

// ─────────────────────────────────────────────────────
// Step 6: Wait for Inngest health (up to 30s)
// ─────────────────────────────────────────────────────
log('── Step 6: Waiting for Inngest health (up to 30s) ──');
const inngestReady = await waitForHttp('http://localhost:8288/', 30_000);
if (!inngestReady) {
  fail('Inngest Dev Server did not become healthy after 30s');
  await cleanup();
  process.exit(1);
}
ok('Inngest Dev Server is healthy at http://localhost:8288');
log('');

// ─────────────────────────────────────────────────────
// Step 7: Start Event Gateway
// ─────────────────────────────────────────────────────
log('── Step 7: Starting Event Gateway ──');

// Merge process.env (which already has .env loaded) with USE_LOCAL_DOCKER override
const gatewayEnv: NodeJS.ProcessEnv = { ...process.env, USE_LOCAL_DOCKER: '1' };

const gatewayProc = spawn('node', ['--import', 'tsx/esm', 'src/gateway/server.ts'], {
  stdio: 'pipe',
  detached: false,
  env: gatewayEnv,
});
children.push(gatewayProc);

gatewayProc.stdout?.on('data', (d: Buffer) =>
  process.stdout.write(`${C.cyan}[gateway]${C.reset} ${d}`),
);
gatewayProc.stderr?.on('data', (d: Buffer) =>
  process.stderr.write(`${C.cyan}[gateway]${C.reset} ${d}`),
);
gatewayProc.on('exit', (code) => {
  if (!cleaningUp) log(`${C.yellow}[gateway] exited with code ${code}${C.reset}`);
});

ok(`Event Gateway started (PID: ${gatewayProc.pid})`);
log('');

// ─────────────────────────────────────────────────────
// Step 8: Wait for Gateway health (up to 30s)
// ─────────────────────────────────────────────────────
log('── Step 8: Waiting for Gateway health (up to 30s) ──');
const gatewayReady = await waitForHttp('http://localhost:3000/health', 30_000);
if (!gatewayReady) {
  fail('Event Gateway did not become healthy after 30s');
  await cleanup();
  process.exit(1);
}
ok('Event Gateway is healthy at http://localhost:3000');
log('');

// ─────────────────────────────────────────────────────
// Summary banner
// ─────────────────────────────────────────────────────
log('╔══════════════════════════════════════════════════╗');
log('║          Local E2E Environment Ready            ║');
log('╚══════════════════════════════════════════════════╝');
log('  Supabase:   http://localhost:54321');
log('  Studio:     http://localhost:54323');
log('  Inngest:    http://localhost:8288');
log('  Gateway:    http://localhost:3000');
log('');
log('  Press Ctrl+C to stop all services.');
log('');

// Block until Ctrl+C (SIGINT/SIGTERM handled above)
await new Promise<void>(() => {});
