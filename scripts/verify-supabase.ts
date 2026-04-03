#!/usr/bin/env tsx
/**
 * verify-supabase.ts — Verify the local Supabase Docker Compose stack is healthy
 *
 * Checks:
 * 1. PostgreSQL is accepting connections on POSTGRES_PORT_HOST
 * 2. Kong (API Gateway) returns HTTP 200 on KONG_HTTP_PORT_HOST
 * 3. The project database (POSTGRES_DB) exists
 * 4. Studio is accessible on STUDIO_PORT_HOST
 *
 * Usage: npx tsx scripts/verify-supabase.ts
 */

import { $ } from 'zx';
import { existsSync, readFileSync } from 'node:fs';

$.verbose = false;

function readDockerEnv(): Record<string, string> {
  const envPath = 'docker/.env';
  if (!existsSync(envPath)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

const ok = (msg: string) => console.log(`  ${COLORS.green}✓${COLORS.reset} ${msg}`);
const fail = (msg: string) => console.log(`  ${COLORS.red}✗${COLORS.reset} ${msg}`);

console.log(`\n${COLORS.bold}${COLORS.cyan}Supabase Health Check — ai-employee${COLORS.reset}\n`);

const dockerEnv = readDockerEnv();
const kongPort = dockerEnv['KONG_HTTP_PORT_HOST'] ?? '54321';
const pgPort = dockerEnv['POSTGRES_PORT_HOST'] ?? '54322';
const studioPort = dockerEnv['STUDIO_PORT_HOST'] ?? '54323';
const pgDb = dockerEnv['POSTGRES_DB'] ?? 'ai_employee';
const pgPass = dockerEnv['POSTGRES_PASSWORD'] ?? 'postgres';

let passed = 0;
let failed = 0;

try {
  await $`pg_isready -h localhost -p ${pgPort} -U postgres`;
  ok(`PostgreSQL on port ${pgPort}`);
  passed++;
} catch {
  fail(`PostgreSQL not responding on port ${pgPort}`);
  failed++;
}

try {
  const result =
    await $`curl -sf -o /dev/null -w "%{http_code}" http://localhost:${kongPort}/rest/v1/`;
  const code = result.stdout.trim();
  if (code === '200') {
    ok(`Kong/PostgREST on port ${kongPort} (HTTP ${code})`);
    passed++;
  } else {
    fail(`Kong on port ${kongPort} returned HTTP ${code}`);
    failed++;
  }
} catch {
  fail(`Kong not responding on port ${kongPort}`);
  failed++;
}

try {
  await $`psql postgresql://postgres:${pgPass}@localhost:${pgPort}/${pgDb} -c "SELECT 1;" -t`;
  ok(`Database '${pgDb}' exists and is accessible`);
  passed++;
} catch {
  fail(`Database '${pgDb}' not accessible on port ${pgPort}`);
  failed++;
}

try {
  const result = await $`curl -sf -o /dev/null -w "%{http_code}" http://localhost:${studioPort}`;
  const code = result.stdout.trim();
  if (code === '200') {
    ok(`Studio on port ${studioPort} (HTTP ${code})`);
    passed++;
  } else {
    fail(`Studio on port ${studioPort} returned HTTP ${code}`);
    failed++;
  }
} catch {
  fail(`Studio not responding on port ${studioPort}`);
  failed++;
}

console.log('');
if (failed === 0) {
  console.log(`${COLORS.green}${COLORS.bold}✅ All ${passed} checks passed${COLORS.reset}`);
  console.log(`   Kong:     http://localhost:${kongPort}`);
  console.log(`   Studio:   http://localhost:${studioPort}`);
  console.log(`   Database: ${pgDb} on port ${pgPort}`);
  process.exit(0);
} else {
  console.log(`${COLORS.red}${COLORS.bold}❌ ${failed} check(s) failed${COLORS.reset}`);
  console.log(`   Run: docker compose -f docker/docker-compose.yml ps`);
  process.exit(1);
}
