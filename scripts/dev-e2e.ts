#!/usr/bin/env tsx
/**
 * dev-e2e.ts — Single-command local E2E for guest messaging employee
 *
 * Starts all services, builds Docker image, runs pre-flight checks,
 * triggers a guest messaging task, and shows status information.
 *
 * Usage:
 *   npx tsx scripts/dev-e2e.ts [--reset] [--skip-build] [--trigger-only]
 *
 * Options:
 *   --reset         Reset database and re-seed before starting
 *   --skip-build    Skip Docker image build (faster iteration)
 *   --trigger-only  Skip service startup, just trigger a task (services must already be running)
 *
 * Exit codes:
 *   1 — Docker, missing env vars, service startup failure, or general error
 *   2 — Missing VLRE tenant secrets in DB (hostfully_api_key, hostfully_agency_uid, slack_bot_token)
 *   3 — VLRE Slack OAuth not completed
 */

import { $ } from 'zx';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs';

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

const helpFlag = args.includes('--help') || args.includes('-h');

if (helpFlag) {
  log('');
  log(`${C.bold}dev-e2e${C.reset} — Single-command local E2E for guest messaging employee`);
  log('');
  log(`${C.bold}Usage:${C.reset}`);
  log('  npx tsx scripts/dev-e2e.ts [--reset] [--skip-build] [--trigger-only]');
  log('  pnpm dev:e2e [--reset] [--skip-build] [--trigger-only]');
  log('');
  log(`${C.bold}Options:${C.reset}`);
  log(`  ${C.cyan}--reset${C.reset}         Reset database and re-seed before starting`);
  log(`  ${C.cyan}--skip-build${C.reset}    Skip Docker image build (faster iteration)`);
  log(
    `  ${C.cyan}--trigger-only${C.reset}  Skip service startup — services must already be running`,
  );
  log('');
  log(`${C.bold}Exit codes:${C.reset}`);
  log('  1 — Docker not running, missing env vars, or service startup failure');
  log('  2 — VLRE tenant secrets missing in DB');
  log('  3 — VLRE Slack OAuth not completed');
  log('');
  log(`${C.bold}Examples:${C.reset}`);
  log('  npx tsx scripts/dev-e2e.ts                   # full start + build + trigger');
  log('  npx tsx scripts/dev-e2e.ts --skip-build      # skip Docker build');
  log('  npx tsx scripts/dev-e2e.ts --trigger-only    # services already up');
  log('  npx tsx scripts/dev-e2e.ts --reset           # wipe DB, re-seed, then start');
  log('');
  process.exit(0);
}

const KNOWN_FLAGS = ['--reset', '--skip-build', '--trigger-only'];
for (const arg of args) {
  if (!KNOWN_FLAGS.includes(arg)) {
    log(`Unknown flag: ${arg}`);
    log('Usage: tsx scripts/dev-e2e.ts [--reset] [--skip-build] [--trigger-only]');
    process.exit(1);
  }
}

const resetFlag = args.includes('--reset');
const skipBuildFlag = args.includes('--skip-build');
const triggerOnlyFlag = args.includes('--trigger-only');

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

const GATEWAY_PORT = process.env.PORT ?? '7700';
const VLRE_TENANT_ID = '00000000-0000-0000-0000-000000000003';

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
log('║  Local Guest Messaging E2E — Initializing       ║');
log('╚══════════════════════════════════════════════════╝');
log('');

// ─────────────────────────────────────────────────────
// Phase 1: Pre-flight checks
// ─────────────────────────────────────────────────────
log('── Phase 1: Pre-flight checks ──');

// 1a. Docker daemon (skip if --trigger-only since Docker may be managed externally)
if (!triggerOnlyFlag) {
  try {
    await $`docker info`;
    ok('Docker daemon is running');
  } catch {
    fail('Docker daemon is not running — start Docker Desktop first');
    process.exit(1);
  }
}

// 1b. Required env vars
const REQUIRED_VARS = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'OPENROUTER_API_KEY',
  'INNGEST_EVENT_KEY',
  'ADMIN_API_KEY',
  'ENCRYPTION_KEY',
  'SLACK_APP_TOKEN',
  'SLACK_SIGNING_SECRET',
] as const;

let envFail = false;
for (const v of REQUIRED_VARS) {
  if (process.env[v]) {
    ok(`${v} is set`);
  } else {
    fail(`${v} is not set — add it to .env`);
    envFail = true;
  }
}

if (envFail) {
  log('');
  fail('Pre-flight failed. Fix missing env vars above and re-run.');
  process.exit(1);
}
log('');

// ─────────────────────────────────────────────────────
// Phase 2: Docker image build
// ─────────────────────────────────────────────────────
if (triggerOnlyFlag) {
  log('── Phase 2: Skipping Docker image build (--trigger-only) ──');
  log('');
} else if (skipBuildFlag) {
  log('── Phase 2: Skipping Docker image build (--skip-build) ──');
  log('');
} else {
  log('── Phase 2: Building Docker image ──');
  info('docker build -t ai-employee-worker:latest .');
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
  log('');
}

// ─────────────────────────────────────────────────────
// Phase 3: Start services (skip if --trigger-only)
// ─────────────────────────────────────────────────────
if (!triggerOnlyFlag) {
  log('── Phase 3: Starting services ──');

  // DB reset if --reset
  if (resetFlag) {
    info('Resetting DB (--reset flag)...');
    $.verbose = true;
    await $`docker compose -f docker/docker-compose.yml down -v`;
    await $`docker compose -f docker/docker-compose.yml up -d`;
    $.verbose = false;

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

  // Stop any conflicting Supabase CLI containers
  try {
    await $`supabase stop`;
    log('  Stopped Supabase CLI containers');
  } catch {
    /* not running or not installed — OK */
  }

  // Ensure docker/.env exists
  if (!existsSync('docker/.env')) {
    if (existsSync('docker/.env.example')) {
      writeFileSync('docker/.env', readFileSync('docker/.env.example', 'utf8'));
      info('docker/.env created from docker/.env.example');
    }
  }

  // Start Docker Compose if not already running
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

  // Wait for PostgREST (up to 120s)
  log('  Waiting for Docker Compose services (up to 120s)...');
  const supabaseReady = await waitForHttp('http://localhost:54321/rest/v1/', 120_000);
  if (!supabaseReady) {
    fail('Docker Compose services did not become healthy after 120s');
    process.exit(1);
  }
  ok('Docker Compose services healthy at http://localhost:54321');

  // Run migrations
  info('Running Prisma migrations...');
  try {
    await $`pnpm prisma migrate deploy`;
  } catch {
    /* already up-to-date */
  }
  ok('Migrations complete (or already up-to-date)');
  log('');

  // Start Inngest Dev Server
  log('── Phase 3b: Starting Inngest Dev Server ──');
  const inngestLogStream = createWriteStream('/tmp/inngest-dev.log');
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
    { stdio: ['ignore', 'pipe', 'pipe'], detached: false },
  );
  children.push(inngestProc);
  inngestProc.stdout?.pipe(inngestLogStream);
  inngestProc.stderr?.pipe(inngestLogStream);
  inngestProc.on('exit', (code) => {
    if (!cleaningUp) log(`${C.yellow}[inngest] exited with code ${code}${C.reset}`);
  });
  ok(`Inngest Dev Server started (PID: ${inngestProc.pid}) → /tmp/inngest-dev.log`);

  // Wait for Inngest (up to 30s)
  const inngestReady = await waitForHttp('http://localhost:8288/', 30_000);
  if (!inngestReady) {
    fail('Inngest Dev Server did not become healthy after 30s');
    await cleanup();
    process.exit(1);
  }
  ok('Inngest Dev Server healthy at http://localhost:8288');
  log('');

  // Start Event Gateway
  log('── Phase 3c: Starting Event Gateway ──');
  const gatewayLogStream = createWriteStream('/tmp/gateway.log');
  const gatewayEnv: NodeJS.ProcessEnv = { ...process.env, USE_LOCAL_DOCKER: '1' };
  const gatewayProc = spawn('node', ['--import', 'tsx/esm', 'src/gateway/server.ts'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
    env: gatewayEnv,
  });
  children.push(gatewayProc);
  gatewayProc.stdout?.pipe(gatewayLogStream);
  gatewayProc.stderr?.pipe(gatewayLogStream);
  gatewayProc.on('exit', (code) => {
    if (!cleaningUp) log(`${C.yellow}[gateway] exited with code ${code}${C.reset}`);
  });
  ok(`Event Gateway started (PID: ${gatewayProc.pid}) → /tmp/gateway.log`);

  // Wait for Gateway (up to 30s)
  const gatewayReady = await waitForHttp(`http://localhost:${GATEWAY_PORT}/health`, 30_000);
  if (!gatewayReady) {
    fail('Event Gateway did not become healthy after 30s');
    await cleanup();
    process.exit(1);
  }
  ok(`Event Gateway healthy at http://localhost:${GATEWAY_PORT}`);
  log('');
}

// ─────────────────────────────────────────────────────
// DB secret checks (runs after services are up)
// ─────────────────────────────────────────────────────
log('── Pre-flight DB checks ──');

const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? '';

// Check VLRE tenant secrets
let secretsRes: Response;
try {
  secretsRes = await fetch(
    `http://localhost:54321/rest/v1/tenant_secrets?tenant_id=eq.${VLRE_TENANT_ID}&select=key`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    },
  );
} catch (err) {
  fail(`Could not reach PostgREST: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
  throw new Error('unreachable');
}

if (!secretsRes.ok) {
  fail(`PostgREST returned HTTP ${secretsRes.status} for tenant_secrets query`);
  process.exit(2);
}

const secretRows = (await secretsRes.json()) as Array<{ key: string }>;
const secretKeys = new Set(secretRows.map((r) => r.key));

const REQUIRED_SECRETS = ['hostfully_api_key', 'hostfully_agency_uid', 'slack_bot_token'] as const;

let secretsFail = false;
for (const k of REQUIRED_SECRETS) {
  if (secretKeys.has(k)) {
    ok(`VLRE secret present: ${k}`);
  } else {
    fail(`VLRE secret missing: ${k}`);
    secretsFail = true;
  }
}

if (secretsFail) {
  log('');
  fail('VLRE tenant secrets are missing. Seed them via the admin API or DB seed.');
  process.exit(2);
}

// Check VLRE Slack OAuth
let oauthRes: Response;
try {
  oauthRes = await fetch(
    `http://localhost:54321/rest/v1/tenant_integrations?tenant_id=eq.${VLRE_TENANT_ID}&provider=eq.slack&select=id`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    },
  );
} catch (err) {
  fail(
    `Could not reach PostgREST for OAuth check: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(3);
  throw new Error('unreachable');
}

if (!oauthRes.ok) {
  fail(`PostgREST returned HTTP ${oauthRes.status} for tenant_integrations query`);
  process.exit(3);
}

const oauthRows = (await oauthRes.json()) as Array<{ id: string }>;
if (oauthRows.length === 0) {
  fail('VLRE Slack OAuth not completed.');
  info(
    'Run: open "http://localhost:7700/slack/install?tenant=00000000-0000-0000-0000-000000000003"',
  );
  process.exit(3);
}
ok('VLRE Slack OAuth completed');
log('');

// ─────────────────────────────────────────────────────
// Phase 4: Trigger guest messaging task
// ─────────────────────────────────────────────────────
log('── Phase 4: Triggering guest messaging task ──');

let triggerRes: Response;
try {
  triggerRes = await fetch(
    `http://localhost:${GATEWAY_PORT}/admin/tenants/${VLRE_TENANT_ID}/employees/guest-messaging/trigger`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': process.env.ADMIN_API_KEY ?? '',
      },
      body: JSON.stringify({}),
    },
  );
} catch (err) {
  fail(`Failed to reach gateway: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
  throw new Error('unreachable');
}

if (!triggerRes.ok) {
  fail(`Failed to trigger task: HTTP ${triggerRes.status} — ${await triggerRes.text()}`);
  process.exit(1);
}

const { task_id: taskId } = (await triggerRes.json()) as { task_id: string };
ok(`Task triggered: ${taskId}`);
log('');

// ─────────────────────────────────────────────────────
// Phase 5: Summary banner
// ─────────────────────────────────────────────────────
log('╔══════════════════════════════════════════════════╗');
log('║    Local Guest Messaging E2E — Running          ║');
log('╚══════════════════════════════════════════════════╝');
log('');
log('  Services:');
log('    Supabase:   http://localhost:54321');
log('    Studio:     http://localhost:54323');
log('    Inngest:    http://localhost:8288');
log(`    Gateway:    http://localhost:${GATEWAY_PORT}`);
log('');
log('  Task:');
log(`    ID:         ${taskId}`);
log(`    Status:     curl -s -H "X-Admin-Key: $ADMIN_API_KEY" \\`);
log(
  `                  "http://localhost:${GATEWAY_PORT}/admin/tenants/${VLRE_TENANT_ID}/tasks/${taskId}" | jq '.status'`,
);
log(`    Worker Log: /tmp/employee-${taskId.slice(0, 8)}.log`);
log('    Gateway:    /tmp/gateway.log');
log('    Inngest:    /tmp/inngest-dev.log');
log('');
log('  Approval (when task reaches Reviewing):');
log('    Check Slack for approval card');
log('    Manual approval:');
log(`      curl -X POST "http://localhost:8288/e/local" \\`);
log(`        -H "Content-Type: application/json" \\`);
log(
  `        -d '{"name":"employee/approval.received","data":{"taskId":"${taskId}","action":"approve","userId":"UMANUAL","userName":"Manual"}}'`,
);
log('');

if (triggerOnlyFlag) {
  log('  Services are managed externally (--trigger-only mode).');
} else {
  log('  Press Ctrl+C to stop all services.');
}
log('');

// Block until Ctrl+C (SIGINT/SIGTERM handled above)
await new Promise<void>(() => {});
