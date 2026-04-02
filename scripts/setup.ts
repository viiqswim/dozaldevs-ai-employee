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
  1. Check prerequisites (node, pnpm, docker, supabase, git)
  2. Verify .env file exists (copies from .env.example if not)
  3. Start Supabase local instance
  4. Create ai_employee database
  5. Run Prisma migrations
  6. Seed database
  7. Build Docker image
  8. Verify health (PostgREST accessible)

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
  { cmd: 'supabase', versionArg: '--version', name: 'Supabase CLI' },
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

if (hasErrors) {
  log(`\n${COLORS.red}Setup failed at Step 2.${COLORS.reset}`);
  process.exit(1);
}

// ─── Step 3: Start Supabase ──────────────────────────────────────────────────
section('Step 3: Supabase');

let supabaseRunning = false;
try {
  const healthResult = await $`curl -sf http://localhost:54321/health`;
  if (healthResult.stdout.includes('healthy')) {
    supabaseRunning = true;
    ok('Supabase already running', 'port 54321');
  }
} catch {}

if (!supabaseRunning) {
  log('  Starting Supabase...');
  try {
    $.verbose = true;
    await $`supabase start`;
    $.verbose = false;
    ok('Supabase started');
  } catch (err) {
    $.verbose = false;
    fail('Failed to start Supabase', String(err));
    hasErrors = true;
  }
}

if (hasErrors) {
  log(`\n${COLORS.red}Setup failed at Step 3.${COLORS.reset}`);
  process.exit(1);
}

// ─── Step 4: Create ai_employee database ─────────────────────────────────────
section('Step 4: Database');

try {
  const dbCheck =
    await $`PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT 1" 2>&1 || echo "NOT_FOUND"`;
  if (dbCheck.stdout.includes('NOT_FOUND') || dbCheck.exitCode !== 0) {
    log('  Creating ai_employee database...');
    await $`PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -c "CREATE DATABASE ai_employee" 2>&1`;
    ok('ai_employee database created');
  } else {
    ok('ai_employee database exists');
  }
} catch {
  // Try to create it — may fail if it already exists (race condition)
  try {
    await $`PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -c "CREATE DATABASE ai_employee" 2>&1`;
    ok('ai_employee database created');
  } catch {
    warn('Could not create ai_employee database', 'may already exist or psql unavailable');
  }
}

// ─── Step 5: Prisma migrations ───────────────────────────────────────────────
section('Step 5: Migrations');

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
  log(`\n${COLORS.red}Setup failed at Step 5.${COLORS.reset}`);
  process.exit(1);
}

// ─── Step 6: Seed database ───────────────────────────────────────────────────
section('Step 6: Seed Data');

try {
  $.verbose = true;
  await $`DATABASE_URL=postgresql://postgres:postgres@localhost:54322/ai_employee pnpm prisma db seed`;
  $.verbose = false;
  ok('Database seeded');
} catch (err) {
  $.verbose = false;
  warn('Seed may have partial results', String(err));
}

// ─── Step 7: Docker image ─────────────────────────────────────────────────────
section('Step 7: Docker Image');

let imageExists = false;
try {
  const imageCheck = await $`docker image inspect ai-employee-worker:latest`;
  if (imageCheck.exitCode === 0) {
    imageExists = true;
  }
} catch {}

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

// ─── Step 8: Health verification ─────────────────────────────────────────────
section('Step 8: Health Check');

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
