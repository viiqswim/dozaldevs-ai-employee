#!/usr/bin/env tsx
/**
 * stress-test — Run an AI employee N times and report success rate + timing
 *
 * Triggers an employee repeatedly, polls each task to completion, extracts
 * timing data from task_status_log, checks for anomalies (tag bleed, retries,
 * missing Slack posts), and outputs a summary report.
 *
 * Usage:
 *   tsx scripts/stress-test.ts [options]
 *   pnpm stress-test [options]
 *
 * Options:
 *   --count <n>        Number of runs (default: 10)
 *   --concurrency <n>  Parallel tasks (default: 1)
 *   --timeout <sec>    Per-task timeout in seconds (default: 300)
 *   --tenant <uuid>    Tenant ID (default: VLRE)
 *   --employee <slug>  Employee slug (default: daily-real-estate-inspiration-2-copy)
 *   --output <path>    JSON output path (default: /tmp/stress-test-<timestamp>.json)
 *   --help             Show this help
 *
 * Examples:
 *   tsx scripts/stress-test.ts --count 5
 *   tsx scripts/stress-test.ts --count 100 --concurrency 3
 *   tsx scripts/stress-test.ts --count 20 --employee real-estate-motivation-bot-2
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { $ } from 'zx';
import { execSync } from 'node:child_process';

$.verbose = false;

// ─── ANSI color helpers ───────────────────────────────────────────────────────

const C = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

function ok(msg: string, detail?: string) {
  console.log(`${C.green}✓${C.reset} ${msg}${detail ? ` ${C.cyan}(${detail})${C.reset}` : ''}`);
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

// ─── Argument parsing ─────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

function getArg(name: string, fallback: string): string {
  const idx = argv.indexOf(name);
  if (idx !== -1 && idx + 1 < argv.length && !argv[idx + 1].startsWith('--')) {
    return argv[idx + 1];
  }
  return fallback;
}

function getNumArg(name: string, fallback: number): number {
  const val = getArg(name, String(fallback));
  const num = parseInt(val, 10);
  return isNaN(num) ? fallback : num;
}

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`
${C.bold}stress-test${C.reset} — Run an AI employee N times and report success rate + timing

${C.bold}Usage:${C.reset}
  tsx scripts/stress-test.ts [options]

${C.bold}Options:${C.reset}
  ${C.cyan}--count <n>${C.reset}        Number of runs (default: 10)
  ${C.cyan}--concurrency <n>${C.reset}  Parallel tasks (default: 1)
  ${C.cyan}--timeout <sec>${C.reset}    Per-task timeout in seconds (default: 300)
  ${C.cyan}--tenant <uuid>${C.reset}    Tenant ID (default: VLRE)
  ${C.cyan}--employee <slug>${C.reset}  Employee slug (default: daily-real-estate-inspiration-2-copy)
  ${C.cyan}--output <path>${C.reset}    JSON output path (default: auto-generated)
  ${C.cyan}--help${C.reset}             Show this help

${C.bold}Examples:${C.reset}
  tsx scripts/stress-test.ts --count 5
  tsx scripts/stress-test.ts --count 100 --concurrency 3
  tsx scripts/stress-test.ts --count 20 --employee real-estate-motivation-bot-2
`);
  process.exit(0);
}

// ─── Config ───────────────────────────────────────────────────────────────────

const VLRE_TENANT = '00000000-0000-0000-0000-000000000003';

const COUNT = getNumArg('--count', 10);
const CONCURRENCY = getNumArg('--concurrency', 1);
const TIMEOUT_SEC = getNumArg('--timeout', 300);
const TENANT_ID = getArg('--tenant', VLRE_TENANT);
const EMPLOYEE_SLUG = getArg('--employee', 'daily-real-estate-inspiration-2-copy');
const GATEWAY_BASE = `http://localhost:${process.env.PORT ?? '7700'}`;
const ADMIN_API_KEY = getEnv('ADMIN_API_KEY');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
const OUTPUT_PATH = getArg('--output', `/tmp/stress-test-${timestamp}.json`);

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaskResult {
  taskId: string;
  runIndex: number;
  status: 'Done' | 'Failed' | 'Timeout';
  timing: {
    totalMs: number;
    executionMs: number | null;
    deliveryMs: number | null;
  };
  retryCount: number;
  tagBleed: boolean;
  slackPosted: boolean;
  error?: string;
}

interface TimingStats {
  p50: number;
  p90: number;
  p99: number;
  min: number;
  max: number;
  avg: number;
}

// ─── Database helper ──────────────────────────────────────────────────────────

async function psql(sql: string): Promise<string> {
  try {
    const result =
      await $`PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -A -c ${sql} 2>/dev/null`;
    return result.stdout.trim();
  } catch {
    return '';
  }
}

// ─── Core functions ───────────────────────────────────────────────────────────

async function triggerTask(): Promise<string> {
  const url = `${GATEWAY_BASE}/admin/tenants/${TENANT_ID}/employees/${EMPLOYEE_SLUG}/trigger`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': ADMIN_API_KEY,
    },
    body: '{}',
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Trigger failed: HTTP ${resp.status} — ${text}`);
  }
  const json = (await resp.json()) as { task_id: string };
  return json.task_id;
}

async function pollUntilTerminal(
  taskId: string,
  timeoutMs: number,
): Promise<'Done' | 'Failed' | 'Timeout'> {
  const deadline = Date.now() + timeoutMs;
  const pollInterval = 3000;

  while (Date.now() < deadline) {
    const status = await psql(`SELECT status FROM tasks WHERE id = '${taskId}'`);

    if (status === 'Done') return 'Done';
    if (status === 'Failed') {
      await sleep(5000);
      const retryStatus = await psql(`SELECT status FROM tasks WHERE id = '${taskId}'`);
      if (retryStatus === 'Done') return 'Done';
      if (retryStatus === 'Delivering' || retryStatus === 'Executing') {
        continue;
      } else {
        return 'Failed';
      }
    }
    if (status === 'Cancelled') return 'Failed';

    await sleep(pollInterval);
  }

  return 'Timeout';
}

async function extractTimings(
  taskId: string,
): Promise<{ totalMs: number; executionMs: number | null; deliveryMs: number | null }> {
  const rows = await psql(
    `SELECT to_status, extract(epoch from created_at) * 1000 as ms FROM task_status_log WHERE task_id = '${taskId}' ORDER BY created_at ASC`,
  );
  if (!rows) return { totalMs: 0, executionMs: null, deliveryMs: null };

  const transitions: Array<{ status: string; ms: number }> = [];
  for (const line of rows.split('\n')) {
    const [status, msStr] = line.split('|');
    if (status && msStr) {
      transitions.push({ status: status.trim(), ms: parseFloat(msStr) });
    }
  }

  const first = transitions[0];
  const last = transitions[transitions.length - 1];
  const totalMs = first && last ? last.ms - first.ms : 0;

  const executing = transitions.find((t) => t.status === 'Executing');
  const validating = transitions.find((t) => t.status === 'Validating');
  const executionMs = executing && validating ? validating.ms - executing.ms : null;

  const deliveringAll = transitions.filter((t) => t.status === 'Delivering');
  const lastDelivering = deliveringAll[deliveringAll.length - 1];
  const done = transitions.find((t) => t.status === 'Done');
  const deliveryMs = lastDelivering && done ? done.ms - lastDelivering.ms : null;

  return { totalMs, executionMs, deliveryMs };
}

async function countRetries(taskId: string): Promise<number> {
  const count = await psql(
    `SELECT COUNT(*) FROM task_status_log WHERE task_id = '${taskId}' AND to_status = 'Delivering'`,
  );
  const n = parseInt(count, 10) || 0;
  return Math.max(0, n - 1);
}

function checkTagBleed(taskId: string): boolean {
  const shortId = taskId.slice(0, 8);
  const logPath = `/tmp/employee-${shortId}.log`;
  try {
    const log = execSync(`grep "post-message" "${logPath}" 2>/dev/null`, {
      encoding: 'utf8',
      timeout: 5000,
    });
    return log.trim().length > 0;
  } catch {
    return false;
  }
}

function checkSlackPosted(taskId: string): boolean {
  const shortId = taskId.slice(0, 8);
  const logPath = `/tmp/employee-delivery-${shortId}.log`;
  try {
    const log = execSync(`grep "post-message" "${logPath}" 2>/dev/null`, {
      encoding: 'utf8',
      timeout: 5000,
    });
    return log.trim().length > 0;
  } catch {
    return false;
  }
}

// ─── Statistics helpers ───────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function computeStats(values: number[]): TimingStats {
  if (values.length === 0) return { p50: 0, p90: 0, p99: 0, min: 0, max: 0, avg: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p99: percentile(sorted, 99),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(sorted.reduce((s, v) => s + v, 0) / sorted.length),
  };
}

function formatMs(ms: number): string {
  const s = ms / 1000;
  return s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${s.toFixed(1)}s`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Single run ───────────────────────────────────────────────────────────────

async function runSingle(runIndex: number): Promise<TaskResult> {
  const taskId = await triggerTask();
  const shortId = taskId.slice(0, 8);

  process.stdout.write(`  ${C.dim}[${runIndex + 1}/${COUNT}]${C.reset} ${shortId} `);

  const status = await pollUntilTerminal(taskId, TIMEOUT_SEC * 1000);
  const timing = await extractTimings(taskId);
  const retryCount = await countRetries(taskId);
  const tagBleed = checkTagBleed(taskId);
  const slackPosted = status === 'Done' ? checkSlackPosted(taskId) : false;

  if (status === 'Done') {
    const totalStr = formatMs(timing.totalMs);
    const execStr = timing.executionMs ? formatMs(timing.executionMs) : '?';
    const delivStr = timing.deliveryMs ? formatMs(timing.deliveryMs) : '?';
    let flags = '';
    if (tagBleed) flags += ` ${C.red}TAG-BLEED${C.reset}`;
    if (retryCount > 0) flags += ` ${C.yellow}RETRY×${retryCount}${C.reset}`;
    if (!slackPosted) flags += ` ${C.red}NO-SLACK${C.reset}`;
    console.log(
      `${C.green}Done${C.reset} ${C.dim}${totalStr} (exec:${execStr} deliv:${delivStr})${C.reset}${flags}`,
    );
  } else if (status === 'Failed') {
    console.log(`${C.red}Failed${C.reset}`);
  } else {
    console.log(`${C.yellow}Timeout${C.reset} ${C.dim}(>${TIMEOUT_SEC}s)${C.reset}`);
  }

  return {
    taskId,
    runIndex,
    status,
    timing,
    retryCount,
    tagBleed,
    slackPosted,
    error: status !== 'Done' ? `Terminal status: ${status}` : undefined,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startMs = Date.now();

  // ── Validate ──────────────────────────────────────────────────────────────

  section('Configuration');
  info(`Employee:    ${EMPLOYEE_SLUG}`);
  info(`Tenant:      ${TENANT_ID}`);
  info(`Count:       ${COUNT}`);
  info(`Concurrency: ${CONCURRENCY}`);
  info(`Timeout:     ${TIMEOUT_SEC}s per task`);
  info(`Output:      ${OUTPUT_PATH}`);

  if (!ADMIN_API_KEY) {
    fail('ADMIN_API_KEY not set in .env');
    process.exit(1);
  }

  try {
    const resp = await fetch(`${GATEWAY_BASE}/health`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    ok('Gateway healthy');
  } catch (err) {
    fail(`Gateway not reachable at ${GATEWAY_BASE}`);
    fail('Start it with: pnpm dev');
    process.exit(1);
  }

  try {
    const resp = await fetch(
      `${GATEWAY_BASE}/admin/tenants/${TENANT_ID}/employees/${EMPLOYEE_SLUG}/trigger?dry_run=true`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_API_KEY },
        body: '{}',
      },
    );
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${text}`);
    }
    ok(`Employee ${EMPLOYEE_SLUG} validated`);
  } catch (err) {
    fail(`Employee validation failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // ── Run tasks ─────────────────────────────────────────────────────────────

  section(`Running ${COUNT} tasks (concurrency: ${CONCURRENCY})`);

  const results: TaskResult[] = [];

  if (CONCURRENCY <= 1) {
    for (let i = 0; i < COUNT; i++) {
      const result = await runSingle(i);
      results.push(result);
    }
  } else {
    for (let batchStart = 0; batchStart < COUNT; batchStart += CONCURRENCY) {
      const batchEnd = Math.min(batchStart + CONCURRENCY, COUNT);
      const batchSize = batchEnd - batchStart;
      console.log(
        `\n  ${C.dim}Batch ${Math.floor(batchStart / CONCURRENCY) + 1}: tasks ${batchStart + 1}–${batchEnd}${C.reset}`,
      );

      const promises: Promise<TaskResult>[] = [];
      for (let i = batchStart; i < batchEnd; i++) {
        promises.push(runSingle(i));
      }
      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
    }
  }

  // ── Report ────────────────────────────────────────────────────────────────

  const totalElapsed = Date.now() - startMs;
  const succeeded = results.filter((r) => r.status === 'Done');
  const failed = results.filter((r) => r.status === 'Failed');
  const timedOut = results.filter((r) => r.status === 'Timeout');
  const tagBleeds = results.filter((r) => r.tagBleed);
  const retries = results.filter((r) => r.retryCount > 0);
  const noSlack = succeeded.filter((r) => !r.slackPosted);

  const totalTimes = succeeded.map((r) => r.timing.totalMs);
  const execTimes = succeeded
    .map((r) => r.timing.executionMs)
    .filter((t): t is number => t !== null);
  const delivTimes = succeeded
    .map((r) => r.timing.deliveryMs)
    .filter((t): t is number => t !== null);

  const totalStats = computeStats(totalTimes);
  const execStats = computeStats(execTimes);
  const delivStats = computeStats(delivTimes);

  section('Results');

  const rate = COUNT > 0 ? ((succeeded.length / COUNT) * 100).toFixed(1) : '0';
  const rateColor =
    succeeded.length === COUNT ? C.green : succeeded.length >= COUNT * 0.9 ? C.yellow : C.red;
  console.log(
    `\n  ${C.bold}Success rate:${C.reset}  ${rateColor}${succeeded.length}/${COUNT} (${rate}%)${C.reset}`,
  );
  if (failed.length > 0) {
    console.log(
      `  ${C.bold}Failed:${C.reset}        ${C.red}${failed.length}${C.reset}  ${C.dim}[${failed.map((r) => r.taskId.slice(0, 8)).join(', ')}]${C.reset}`,
    );
  }
  if (timedOut.length > 0) {
    console.log(
      `  ${C.bold}Timed out:${C.reset}     ${C.yellow}${timedOut.length}${C.reset}  ${C.dim}[${timedOut.map((r) => r.taskId.slice(0, 8)).join(', ')}]${C.reset}`,
    );
  }

  if (succeeded.length > 0) {
    console.log(`\n  ${C.bold}Timing (seconds):${C.reset}`);
    console.log(
      `  ${C.dim}${''.padEnd(14)}P50      P90      P99      Min      Max      Avg${C.reset}`,
    );

    function statRow(label: string, stats: TimingStats) {
      const row = [stats.p50, stats.p90, stats.p99, stats.min, stats.max, stats.avg]
        .map((v) => formatMs(v).padStart(7))
        .join('  ');
      console.log(`  ${label.padEnd(14)}${row}`);
    }

    statRow('Total:', totalStats);
    statRow('Execution:', execStats);
    statRow('Delivery:', delivStats);
  }

  console.log(`\n  ${C.bold}Anomalies:${C.reset}`);
  const anomalyColor = (count: number) => (count === 0 ? C.green : C.red);
  console.log(
    `  Tag bleed:     ${anomalyColor(tagBleeds.length)}${tagBleeds.length}/${COUNT}${C.reset}${tagBleeds.length > 0 ? `  ${C.dim}[${tagBleeds.map((r) => r.taskId.slice(0, 8)).join(', ')}]${C.reset}` : ''}`,
  );
  console.log(
    `  Retries:       ${anomalyColor(retries.length)}${retries.length}/${COUNT}${C.reset}${retries.length > 0 ? `  ${C.dim}[${retries.map((r) => r.taskId.slice(0, 8)).join(', ')}]${C.reset}` : ''}`,
  );
  console.log(
    `  No Slack msg:  ${anomalyColor(noSlack.length)}${noSlack.length}/${succeeded.length}${C.reset}${noSlack.length > 0 ? `  ${C.dim}[${noSlack.map((r) => r.taskId.slice(0, 8)).join(', ')}]${C.reset}` : ''}`,
  );

  if (failed.length > 0 || timedOut.length > 0) {
    console.log(`\n  ${C.bold}Failed task details:${C.reset}`);
    for (const r of [...failed, ...timedOut]) {
      const lastStatus = await psql(
        `SELECT to_status FROM task_status_log WHERE task_id = '${r.taskId}' ORDER BY created_at DESC LIMIT 1`,
      );
      console.log(
        `  ${C.dim}${r.taskId.slice(0, 8)}${C.reset}: ${r.status} ${C.dim}(last state: ${lastStatus || 'unknown'})${C.reset}`,
      );
    }
  }

  console.log(`\n  ${C.dim}Total wall time: ${formatMs(totalElapsed)}${C.reset}`);

  // ── Save JSON ─────────────────────────────────────────────────────────────

  const report = {
    timestamp: new Date().toISOString(),
    config: {
      employee: EMPLOYEE_SLUG,
      tenant: TENANT_ID,
      count: COUNT,
      concurrency: CONCURRENCY,
      timeoutSec: TIMEOUT_SEC,
    },
    summary: {
      successRate: `${succeeded.length}/${COUNT}`,
      successPct: parseFloat(rate),
      failed: failed.length,
      timedOut: timedOut.length,
      tagBleeds: tagBleeds.length,
      retries: retries.length,
      noSlack: noSlack.length,
      wallTimeMs: totalElapsed,
    },
    timing: {
      total: totalStats,
      execution: execStats,
      delivery: delivStats,
    },
    results,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));
  ok(`Report saved to ${OUTPUT_PATH}`);

  // ── Docker cleanup ────────────────────────────────────────────────────────

  try {
    const exited =
      await $`docker ps -a --filter "ancestor=ai-employee-worker" --filter "status=exited" --format "{{.ID}}" 2>/dev/null`;
    const ids = exited.stdout.trim().split('\n').filter(Boolean);
    if (ids.length > 0) {
      await $`docker rm ${ids} 2>/dev/null`;
      info(`Cleaned up ${ids.length} exited worker containers`);
    }
  } catch {
    void 0;
  }

  process.exit(failed.length + timedOut.length > 0 ? 1 : 0);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

main().catch((err) => {
  fail(`Unhandled error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
