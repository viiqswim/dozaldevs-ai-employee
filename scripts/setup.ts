#!/usr/bin/env tsx
/**
 * Setup script for AI Employee Platform
 *
 * Idempotent: safe to run multiple times. Each step checks if already done.
 * Run: npx tsx scripts/setup.ts
 * Options: --reset (rebuild Docker image), --help
 */

import { $ } from 'zx';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// Disable auto-output by default, we control output
$.verbose = false;

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

function log(msg: string) {
  console.log(msg);
}
function ok(step: string, detail?: string) {
  log(
    `${COLORS.green}✓${COLORS.reset} ${step}${detail ? ` ${COLORS.cyan}(${detail})${COLORS.reset}` : ''}`,
  );
}
function warn(step: string, detail?: string) {
  log(`${COLORS.yellow}⚠${COLORS.reset} ${step}${detail ? ` — ${detail}` : ''}`);
}
function fail(step: string, detail?: string) {
  log(`${COLORS.red}✗${COLORS.reset} ${step}${detail ? ` — ${detail}` : ''}`);
}
function section(name: string) {
  log(`\n${COLORS.bold}${COLORS.cyan}── ${name} ──${COLORS.reset}`);
}

const args = process.argv.slice(2);
const resetFlag = args.includes('--reset');
const helpFlag = args.includes('--help') || args.includes('-h');

if (helpFlag) {
  log(`
${COLORS.bold}AI Employee Platform — Setup Script${COLORS.reset}

Usage: npx tsx scripts/setup.ts [options]

Options:
  --reset   Force rebuild Docker image even if it exists
  --help    Show this help

Steps performed:
  1. Check prerequisites (node, pnpm, docker, docker compose, git)
  2. Verify .env + docker/.env files
  3. Start Docker Compose services (PostgreSQL, PostgREST, and more)
  4. Run Prisma migrations
  5. Seed database
  6. Build Docker image
  7. Verify health (PostgREST accessible)

All steps are idempotent — safe to run multiple times.
`);
  process.exit(0);
}

log(`\n${COLORS.bold}AI Employee Platform — Setup${COLORS.reset}`);
log('Running setup checks...\n');

let hasErrors = false;

// ─── Step 1: Prerequisites ────────────────────────────────────────────────────
section('Step 1: Prerequisites');

type Prereq = { cmd: string; versionArg: string; name: string };
const prereqs: Prereq[] = [
  { cmd: 'node', versionArg: '--version', name: 'Node.js ≥20' },
  { cmd: 'pnpm', versionArg: '--version', name: 'pnpm' },
  { cmd: 'docker', versionArg: '--version', name: 'Docker' },
  { cmd: 'git', versionArg: '--version', name: 'git' },
];

for (const { cmd, versionArg, name } of prereqs) {
  try {
    const result = await $`${cmd} ${versionArg}`;
    const version = result.stdout.trim().split('\n')[0];
    ok(name, version);
  } catch {
    fail(`${name} — not found. Install it first.`);
    hasErrors = true;
  }
}

// Check docker compose separately (two-word command)
try {
  const result = await $`docker compose version`;
  ok('Docker Compose', result.stdout.trim().split('\n')[0]);
} catch {
  fail('Docker Compose not found — install Docker Desktop or Docker Compose plugin');
  hasErrors = true;
}

if (hasErrors) {
  log(
    `\n${COLORS.red}Setup failed: missing prerequisites. Install them and try again.${COLORS.reset}`,
  );
  process.exit(1);
}

// ─── Step 2: .env file ───────────────────────────────────────────────────────
section('Step 2: Environment Configuration');

if (!existsSync('.env')) {
  if (existsSync('.env.example')) {
    writeFileSync('.env', readFileSync('.env.example', 'utf8'));
    warn('.env created from .env.example', 'fill in your API keys before running trigger-task');
  } else {
    fail('.env.example not found — cannot create .env');
    hasErrors = true;
  }
} else {
  const envContent = readFileSync('.env', 'utf8');
  const missingKeys: string[] = [];

  const required = ['DATABASE_URL', 'SUPABASE_URL', 'JIRA_WEBHOOK_SECRET', 'INNGEST_EVENT_KEY'];
  for (const key of required) {
    const match = envContent.match(new RegExp(`^${key}=(.+)$`, 'm'));
    if (!match || match[1] === '""' || match[1].trim() === '') {
      missingKeys.push(key);
    }
  }

  if (missingKeys.length > 0) {
    warn('.env exists but some keys need values', missingKeys.join(', '));
  } else {
    ok('.env file present and configured');
  }
}

if (!existsSync('docker/.env')) {
  if (existsSync('docker/.env.example')) {
    writeFileSync('docker/.env', readFileSync('docker/.env.example', 'utf8'));
    ok('docker/.env created from docker/.env.example');
  } else {
    warn('docker/.env.example not found', 'Docker Compose may fail without it');
  }
} else {
  ok('docker/.env present');
}

if (existsSync('docker/.env')) {
  const dockerEnvContent = readFileSync('docker/.env', 'utf8');
  if (!dockerEnvContent.match(/^COMPOSE_PROJECT_NAME=.+$/m)) {
    warn(
      'docker/.env missing COMPOSE_PROJECT_NAME',
      'add COMPOSE_PROJECT_NAME=supabase-ai-employee to docker/.env',
    );
  } else {
    ok('docker/.env has COMPOSE_PROJECT_NAME');
  }
}

if (hasErrors) {
  log(`\n${COLORS.red}Setup failed at Step 2.${COLORS.reset}`);
  process.exit(1);
}

// ─── Step 3: Start Docker Compose (Supabase Services) ────────────────────────
section('Step 3: Docker Compose (Supabase Services)');

// Stop any existing Supabase CLI containers that may conflict on ports 54321/54322
try {
  await $`supabase stop`;
  log('  Stopped Supabase CLI containers');
} catch {
  /* Supabase CLI not running or not installed — OK */
}

const kongResponding = async (): Promise<boolean> => {
  const result = await $`curl -s -o /dev/null -w "%{http_code}" http://localhost:54321/rest/v1/`;
  const code = result.stdout.trim();
  return code !== '000' && code !== '';
};

let servicesRunning = false;
try {
  if (await kongResponding()) {
    servicesRunning = true;
    ok('Docker Compose services already running', 'port 54321 healthy');
  }
} catch {
  /* not running yet */
}

if (!servicesRunning) {
  log('  Starting Docker Compose services...');
  try {
    $.verbose = true;
    await $`docker compose -f docker/docker-compose.yml up -d`;
    $.verbose = false;

    // Wait up to 120s for PostgREST to be healthy
    let ready = false;
    for (let i = 0; i < 24; i++) {
      await new Promise<void>((r) => setTimeout(r, 5000));
      try {
        if (await kongResponding()) {
          ready = true;
          break;
        }
      } catch {
        /* ignore */
      }
      log(`  ... waiting for services (${(i + 1) * 5}s / 120s)`);
    }

    if (!ready) {
      fail('Docker Compose services did not become healthy after 120s');
      hasErrors = true;
    } else {
      ok('Docker Compose services started and healthy');
    }
  } catch (err) {
    $.verbose = false;
    fail('Failed to start Docker Compose', String(err));
    hasErrors = true;
  }
}

if (hasErrors) {
  log(`\n${COLORS.red}Setup failed at Step 3.${COLORS.reset}`);
  process.exit(1);
}

// ─── Step 4: Prisma migrations ───────────────────────────────────────────────
section('Step 4: Migrations');

try {
  $.verbose = true;
  await $`DATABASE_URL=postgresql://postgres:postgres@localhost:54322/ai_employee DATABASE_URL_DIRECT=postgresql://postgres:postgres@localhost:54322/ai_employee pnpm prisma migrate deploy`;
  $.verbose = false;
  ok('Migrations applied');
} catch (err) {
  $.verbose = false;
  fail('Migration failed', String(err));
  hasErrors = true;
}

if (hasErrors) {
  log(`\n${COLORS.red}Setup failed at Step 4.${COLORS.reset}`);
  process.exit(1);
}

// ─── Step 5: Seed database ───────────────────────────────────────────────────
section('Step 5: Seed Data');

try {
  $.verbose = true;
  await $`DATABASE_URL=postgresql://postgres:postgres@localhost:54322/ai_employee pnpm prisma db seed`;
  $.verbose = false;
  ok('Database seeded');
} catch (err) {
  $.verbose = false;
  warn('Seed may have partial results', String(err));
}

// ─── Step 6: Docker image ─────────────────────────────────────────────────────
section('Step 6: Docker Image');

let imageExists = false;
try {
  const imageCheck = await $`docker image inspect ai-employee-worker:latest`;
  if (imageCheck.exitCode === 0) {
    imageExists = true;
  }
} catch {
  /* image not found — imageExists stays false, will build below */
}

if (imageExists && !resetFlag) {
  ok('Docker image ai-employee-worker:latest exists', 'use --reset to rebuild');
} else {
  if (resetFlag) log('  Rebuilding Docker image (--reset flag)...');
  else log('  Building Docker image (this takes 3-5 minutes)...');

  try {
    $.verbose = true;
    await $`docker build -t ai-employee-worker:latest .`;
    $.verbose = false;
    ok('Docker image built successfully');
  } catch (err) {
    $.verbose = false;
    fail('Docker build failed', String(err));
    hasErrors = true;
  }
}

// ─── Step 7: Health verification ─────────────────────────────────────────────
section('Step 7: Health Check');

try {
  const envContent = readFileSync('.env', 'utf8');
  const keyMatch = envContent.match(/^SUPABASE_SECRET_KEY=(.+)$/m);
  const secretKey = keyMatch ? keyMatch[1].trim().replace(/^"|"$/g, '') : '';

  if (secretKey && !secretKey.includes('your-')) {
    const httpCode =
      await $`curl -s -o /dev/null -w "%{http_code}" "http://localhost:54321/rest/v1/projects?limit=1" -H "apikey: ${secretKey}" -H "Authorization: Bearer ${secretKey}"`;
    if (httpCode.stdout.trim() === '200') {
      ok('PostgREST accessible', 'HTTP 200');
    } else {
      warn('PostgREST returned non-200', `HTTP ${httpCode.stdout.trim()}`);
    }
  } else {
    warn('Cannot verify PostgREST', 'SUPABASE_SECRET_KEY not configured in .env');
  }
} catch (err) {
  warn('Health check failed', String(err));
}

// ─── Summary ──────────────────────────────────────────────────────────────────
log('\n' + '─'.repeat(50));
if (hasErrors) {
  log(
    `${COLORS.red}${COLORS.bold}Setup completed with errors. Review above output.${COLORS.reset}`,
  );
  process.exit(1);
} else {
  log(`${COLORS.green}${COLORS.bold}✓ Setup complete!${COLORS.reset}`);
  log('\nNext steps:');
  log(`  1. ${COLORS.cyan}pnpm dev:start${COLORS.reset}   — start Gateway + Inngest`);
  log(`  2. ${COLORS.cyan}pnpm trigger-task${COLORS.reset} — send a mock Jira webhook`);
  log(`  3. ${COLORS.cyan}pnpm verify:e2e --task-id <uuid>${COLORS.reset} — verify the run`);

  const envContent = readFileSync('.env', 'utf8');
  if (
    envContent.includes('your-openrouter-api-key') ||
    envContent.includes('your-github-personal-access-token')
  ) {
    log(
      `\n${COLORS.yellow}⚠ Reminder: Fill in OPENROUTER_API_KEY and GITHUB_TOKEN in .env before running E2E${COLORS.reset}`,
    );
  }
}
