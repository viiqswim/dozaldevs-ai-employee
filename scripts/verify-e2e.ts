#!/usr/bin/env tsx
/**
 * verify-e2e.ts — 12-point E2E verification for AI Employee
 *
 * Verifies a completed task run hit all integration checkpoints.
 * Port of scripts/verify-e2e.sh
 *
 * Usage:
 *   npx tsx scripts/verify-e2e.ts --task-id <uuid> [--repo owner/repo]
 *
 * Checks:
 *   1. Task created in Supabase (exists with any status)
 *   2. Inngest Dev dashboard (manual — URL printed, auto-pass)
 *   3. Lifecycle function triggered, status transitioned to Executing
 *   4. Docker container booted (or task already Done/Submitting)
 *   5. Heartbeats appearing in executions table
 *   6. Validation runs recorded
 *   7. PR created on GitHub
 *   8. Task status = Done
 *   9. Full status log audit trail (≥4 transitions, 3 actors)
 *  10. Deliverable record exists
 *  11. Execution record fully populated (tokens + agent_version)
 *  12. Container cleaned up (polls up to 30s)
 */

import { $ } from 'zx';
import { existsSync, readFileSync } from 'node:fs';

$.verbose = false;

// ─────────────────────────────────────────────────────
// Argument parsing
// ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
let taskId = '';
let repo = 'viiqswim/ai-employee-test-target';

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
verify-e2e.ts — 12-point E2E verification for AI Employee

Usage:
  npx tsx scripts/verify-e2e.ts --task-id <uuid> [--repo owner/repo]

Options:
  --task-id <uuid>   Task UUID to verify (required)
  --repo <owner/repo> GitHub repo to check for PR (default: viiqswim/ai-employee-test-target)
  --help, -h         Show this help

Checks performed:
  1.  Task created in Supabase
  2.  Inngest Dev dashboard (manual URL printed)
  3.  Lifecycle triggered, status → Executing
  4.  Docker container booted
  5.  Heartbeats in executions table
  6.  Validation runs recorded
  7.  PR created on GitHub
  8.  Task status = Done
  9.  Full status log audit trail
  10. Deliverable record exists
  11. Execution record fully populated
  12. Container cleaned up
`);
  process.exit(0);
}

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--task-id' && args[i + 1]) {
    taskId = args[++i];
  } else if (args[i] === '--repo' && args[i + 1]) {
    repo = args[++i];
  } else if (args[i].startsWith('--task-id=')) {
    taskId = args[i].split('=')[1];
  } else if (args[i].startsWith('--repo=')) {
    repo = args[i].split('=')[1];
  }
}

// ─────────────────────────────────────────────────────
// Database helper — auto-detect DB name from DATABASE_URL
// ─────────────────────────────────────────────────────
function getEnvVar(key: string): string {
  if (process.env[key]) return process.env[key]!;
  if (!existsSync('.env')) return '';
  const match = readFileSync('.env', 'utf8').match(new RegExp(`^${key}=(.+)$`, 'm'));
  return match ? match[1].replace(/^"|"$/g, '') : '';
}

const DB_PASS = 'postgres';
const DB_HOST = 'localhost';
const DB_PORT = '54322';
const DB_USER = 'postgres';
const dbUrl =
  getEnvVar('DATABASE_URL') || 'postgresql://postgres:postgres@localhost:54322/postgres';
const dbNameMatch = dbUrl.match(/\/([^/?]+)(\?|$)/);
const DB_NAME = dbNameMatch ? dbNameMatch[1] : 'postgres';

async function DB_QUERY(query: string): Promise<string> {
  try {
    const result =
      await $`PGPASSWORD=${DB_PASS} psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -t -c ${query}`;
    return result.stdout.replace(/[\s\n]/g, '');
  } catch {
    return '';
  }
}

// Auto-detect most recent task ID if not provided
if (!taskId) {
  taskId = await DB_QUERY('SELECT id FROM tasks ORDER BY created_at DESC LIMIT 1;');
}

// ─────────────────────────────────────────────────────
// Pass/fail helpers
// ─────────────────────────────────────────────────────
let PASS = 0;
let FAIL = 0;

function check_pass(label: string): void {
  PASS++;
  console.log(`  ✓ PASS: ${label}`);
}

function check_fail(label: string): void {
  FAIL++;
  console.log(`  ✗ FAIL: ${label}`);
}

// ─────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────
console.log('');
console.log('╔══════════════════════════════════════════════════╗');
console.log('║   Phase 8: E2E Verification Playbook (12-pt)    ║');
console.log('╚══════════════════════════════════════════════════╝');
console.log('');
console.log(`Task ID:  ${taskId || '<none detected>'}`);
console.log(`Repo:     ${repo}`);
console.log('');

// ─────────────────────────────────────────────────────
// Check 1: Task created in Supabase
// ─────────────────────────────────────────────────────
console.log('── Check 1: Task created in Supabase ──');
const status1 = await DB_QUERY(`SELECT status FROM tasks WHERE id = '${taskId}';`);
if (status1) {
  check_pass(`Check 1: Task ${taskId} created in Supabase (status: ${status1})`);
} else {
  check_fail(`Check 1: Task not found in Supabase with id=${taskId}`);
}

// ─────────────────────────────────────────────────────
// Check 2: Inngest Dev dashboard (MANUAL)
// ─────────────────────────────────────────────────────
console.log('');
console.log('── Check 2: Inngest Dev dashboard (MANUAL VERIFICATION REQUIRED) ──');
console.log('  ℹ️  MANUAL CHECK: Open http://localhost:8288 in your browser');
console.log('  ℹ️  Navigate to: Functions > engineering/task-lifecycle');
console.log(`  ℹ️  Verify: A recent run is visible for task ${taskId}`);
console.log('  ℹ️  This check cannot be automated (Inngest Dev has no API for run history)');
check_pass('Check 2: Inngest dashboard URL printed for manual verification');
console.log('');

// ─────────────────────────────────────────────────────
// Check 3: Lifecycle function triggered, status → Executing
// ─────────────────────────────────────────────────────
console.log('── Check 3: Lifecycle function triggered, status transitioned to Executing ──');
const execStatus3 = await DB_QUERY(`SELECT status FROM tasks WHERE id = '${taskId}';`);
const logCount3Raw = await DB_QUERY(
  `SELECT COUNT(*) FROM task_status_log WHERE task_id = '${taskId}' AND to_status = 'Executing';`,
);
const logCount3 = parseInt(logCount3Raw, 10) || 0;
if (
  logCount3 >= 1 ||
  execStatus3 === 'Executing' ||
  execStatus3 === 'Submitting' ||
  execStatus3 === 'Done'
) {
  check_pass(`Check 3: Lifecycle function triggered task lifecycle (status: ${execStatus3})`);
} else {
  check_fail(`Check 3: Task never reached Executing state (current: ${execStatus3})`);
}

// ─────────────────────────────────────────────────────
// Check 4: Docker container booted
// ─────────────────────────────────────────────────────
console.log('── Check 4: Docker container booted ──');
let container4 = '';
try {
  const res4 = await $`docker ps --filter "ancestor=ai-employee-worker" --format "{{.ID}}"`;
  container4 = res4.stdout.trim().split('\n')[0] ?? '';
} catch {
  container4 = '';
}
const doneStatus4 = await DB_QUERY(`SELECT status FROM tasks WHERE id = '${taskId}';`);
if (container4) {
  check_pass(`Check 4: Docker container ai-employee-worker running (${container4})`);
} else if (doneStatus4 === 'Done' || doneStatus4 === 'Submitting') {
  check_pass(`Check 4: Container ran and completed (task is ${doneStatus4})`);
} else {
  check_fail('Check 4: No ai-employee-worker container found and task not yet complete');
}

// ─────────────────────────────────────────────────────
// Check 5: Heartbeats appearing
// ─────────────────────────────────────────────────────
console.log('── Check 5: Heartbeats appearing ──');
const heartbeat5 = await DB_QUERY(
  `SELECT heartbeat_at FROM executions WHERE task_id = '${taskId}' ORDER BY created_at DESC LIMIT 1;`,
);
if (heartbeat5) {
  check_pass(`Check 5: Heartbeat written to executions (heartbeat_at: ${heartbeat5})`);
} else {
  check_fail(`Check 5: No heartbeat found in executions for task ${taskId}`);
}

// ─────────────────────────────────────────────────────
// Check 6: Validation runs recorded
// ─────────────────────────────────────────────────────
console.log('── Check 6: Validation runs recorded ──');
const valCountRaw = await DB_QUERY(
  `SELECT COUNT(*) FROM validation_runs vr JOIN executions e ON vr.execution_id = e.id WHERE e.task_id = '${taskId}';`,
);
const valCount6 = parseInt(valCountRaw, 10) || 0;
if (valCount6 >= 1) {
  check_pass(`Check 6: ${valCount6} validation run(s) recorded for task`);
} else {
  check_fail(`Check 6: No validation runs found for task ${taskId}`);
}

// ─────────────────────────────────────────────────────
// Check 7: PR created on GitHub
// ─────────────────────────────────────────────────────
console.log('── Check 7: PR created on GitHub ──');
let prOpen7 = 0;
let prMerged7 = 0;
try {
  const openRes = await $`gh pr list --repo ${repo} --state open --json number,title`;
  prOpen7 = (JSON.parse(openRes.stdout.trim() || '[]') as unknown[]).length;
} catch {
  prOpen7 = 0;
}
try {
  const mergedRes = await $`gh pr list --repo ${repo} --state merged --json number,title`;
  prMerged7 = (JSON.parse(mergedRes.stdout.trim() || '[]') as unknown[]).length;
} catch {
  prMerged7 = 0;
}
if (prOpen7 >= 1 || prMerged7 >= 1) {
  check_pass(`Check 7: PR found on GitHub repo ${repo}`);
} else {
  check_fail(`Check 7: No PR found on GitHub repo ${repo}`);
}

// ─────────────────────────────────────────────────────
// Check 8: Task status = Done
// ─────────────────────────────────────────────────────
console.log('── Check 8: Task status = Done ──');
const finalStatus8 = await DB_QUERY(`SELECT status FROM tasks WHERE id = '${taskId}';`);
if (finalStatus8 === 'Done') {
  check_pass('Check 8: Task status is Done');
} else {
  check_fail(`Check 8: Task status is '${finalStatus8}' (expected Done)`);
}

// ─────────────────────────────────────────────────────
// Check 9: Full status log audit trail (4 transitions)
// ─────────────────────────────────────────────────────
console.log('── Check 9: Full status log audit trail ──');
const logCount9 =
  parseInt(
    await DB_QUERY(`SELECT COUNT(*) FROM task_status_log WHERE task_id = '${taskId}';`),
    10,
  ) || 0;
const gatewayLog9 =
  parseInt(
    await DB_QUERY(
      `SELECT COUNT(*) FROM task_status_log WHERE task_id = '${taskId}' AND actor = 'gateway';`,
    ),
    10,
  ) || 0;
const lifecycleLog9 =
  parseInt(
    await DB_QUERY(
      `SELECT COUNT(*) FROM task_status_log WHERE task_id = '${taskId}' AND actor = 'lifecycle_fn';`,
    ),
    10,
  ) || 0;
const machineLog9 =
  parseInt(
    await DB_QUERY(
      `SELECT COUNT(*) FROM task_status_log WHERE task_id = '${taskId}' AND actor = 'machine';`,
    ),
    10,
  ) || 0;
if (logCount9 >= 4 && gatewayLog9 >= 1 && lifecycleLog9 >= 1 && machineLog9 >= 1) {
  check_pass(
    `Check 9: Full audit trail present (${logCount9} transitions — gateway, lifecycle_fn, machine)`,
  );
} else {
  check_fail(
    `Check 9: Incomplete audit trail (${logCount9} transitions — gateway:${gatewayLog9} lifecycle_fn:${lifecycleLog9} machine:${machineLog9})`,
  );
}

// ─────────────────────────────────────────────────────
// Check 10: Deliverable record exists
// ─────────────────────────────────────────────────────
console.log('── Check 10: Deliverable record exists ──');
const delivCount10 =
  parseInt(
    await DB_QUERY(
      `SELECT COUNT(*) FROM deliverables d JOIN executions e ON d.execution_id = e.id WHERE e.task_id = '${taskId}';`,
    ),
    10,
  ) || 0;
if (delivCount10 >= 1) {
  check_pass('Check 10: Deliverable record exists for task');
} else {
  check_fail(`Check 10: No deliverable record found for task ${taskId}`);
}

// ─────────────────────────────────────────────────────
// Check 11: Execution record fully populated
// ─────────────────────────────────────────────────────
console.log('── Check 11: Execution record fully populated ──');
const execPopulated11 =
  parseInt(
    await DB_QUERY(
      `SELECT COUNT(*) FROM executions WHERE task_id = '${taskId}' AND prompt_tokens IS NOT NULL AND completion_tokens IS NOT NULL AND agent_version_id IS NOT NULL;`,
    ),
    10,
  ) || 0;
if (execPopulated11 >= 1) {
  check_pass('Check 11: Execution record fully populated (tokens, agent_version)');
} else {
  check_fail(
    'Check 11: Execution record missing fields (prompt_tokens, completion_tokens, or agent_version_id)',
  );
}

// ─────────────────────────────────────────────────────
// Check 12: Container cleaned up (polling up to 30s)
// ─────────────────────────────────────────────────────
console.log('── Check 12: Container cleanup (polling up to 30s) ──');
const MAX_WAIT = 30;
let waited = 0;
let containerGone = false;
while (waited < MAX_WAIT) {
  let running = 0;
  try {
    const res12 = await $`docker ps --filter "ancestor=ai-employee-worker" --format "{{.ID}}"`;
    const lines = res12.stdout.trim();
    running = lines ? lines.split('\n').length : 0;
  } catch {
    running = 0;
  }
  if (running === 0) {
    containerGone = true;
    break;
  }
  await new Promise<void>((r) => setTimeout(r, 5000));
  waited += 5;
}
if (containerGone) {
  check_pass('Check 12: Worker container cleaned up after completion');
} else {
  check_fail(`Check 12: Worker container still running after ${MAX_WAIT}s — check docker ps`);
}

// ─────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────
console.log('');
console.log('╔══════════════════════════════════════════════════╗');
if (FAIL === 0) {
  console.log('║   ✅  ALL 12/12 CHECKS PASSED — Phase 8 Done!   ║');
} else {
  console.log(`║   ❌  ${PASS}/12 checks passed, ${FAIL} FAILED         ║`);
}
console.log('╚══════════════════════════════════════════════════╝');
console.log('');
console.log(`Task ID:  ${taskId}`);
console.log(`Repo:     ${repo}`);
console.log('');

process.exit(FAIL > 0 ? 1 : 0);
