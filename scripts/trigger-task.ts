#!/usr/bin/env tsx
/**
 * trigger-task — Send a mock Jira webhook and monitor task execution
 *
 * This script demonstrates how to trigger the AI Employee workflow end-to-end:
 *   1. Reads a Jira webhook payload JSON file
 *   2. Computes an HMAC-SHA256 signature (identical to gateway validation)
 *   3. POSTs to the gateway's /webhooks/jira endpoint
 *   4. Polls the database for status updates until task completes or errors
 *   5. Reports the PR URL on completion
 *
 * Usage:
 *   npx tsx scripts/trigger-task.ts [options]
 *   pnpm trigger-task [options]
 *
 * Options:
 *   --payload <path>   Path to JSON payload file
 *                      (default: test-payloads/jira-realistic-task.json)
 *   --key <key>        Override Jira issue key to avoid branch conflicts
 *                      Tip: use a unique key, e.g. --key TEST-$(date +%s)
 *   --gateway <url>    Gateway base URL (default: http://localhost:3000)
 *   --timeout <mins>   Max minutes to wait for completion (default: 20)
 *   --help             Show this help
 *
 * Examples:
 *   npx tsx scripts/trigger-task.ts
 *   npx tsx scripts/trigger-task.ts --key TEST-$(date +%s)
 *   npx tsx scripts/trigger-task.ts --payload test-payloads/jira-realistic-task.json --key TEST-200
 *   npx tsx scripts/trigger-task.ts --gateway http://localhost:3000 --timeout 30
 *
 * The Jira webhook payload format (required fields):
 *   {
 *     "webhookEvent": "jira:issue_created",
 *     "issue": {
 *       "id": "12345",
 *       "key": "PROJECT-123",
 *       "fields": {
 *         "summary": "Implement feature X",
 *         "description": "Detailed requirements...",
 *         "project": { "key": "TEST" }
 *       }
 *     }
 *   }
 *
 * How HMAC signing works (matches src/gateway/validation/signature.ts):
 *   The gateway reads the raw request body bytes via fastify-raw-body and computes:
 *     HMAC-SHA256(rawBody, JIRA_WEBHOOK_SECRET) → hex → "sha256=<hex>"
 *   We must sign the EXACT bytes we send — no re-serialization after signing.
 *
 * Environment variables read from .env (never committed):
 *   JIRA_WEBHOOK_SECRET  — must match gateway's secret
 *   DATABASE_URL         — postgres connection for status polling
 */

import { createHmac } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { $ } from 'zx';

// Suppress zx command echoing — we control all output manually
$.verbose = false;

// ─── ANSI color helpers (same palette as setup.ts) ───────────────────────────

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

// ─── Argument parsing ─────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

/** Get the value of a named argument, e.g. --key TEST-123 → "TEST-123" */
function getArg(name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx !== -1 && idx + 1 < argv.length && !argv[idx + 1].startsWith('--')) {
    return argv[idx + 1];
  }
  return undefined;
}

const helpFlag = argv.includes('--help') || argv.includes('-h');

if (helpFlag) {
  console.log(`
${C.bold}trigger-task${C.reset} — Send a mock Jira webhook and monitor task execution

${C.bold}Usage:${C.reset}
  npx tsx scripts/trigger-task.ts [options]
  pnpm trigger-task [options]

${C.bold}Options:${C.reset}
  ${C.cyan}--payload <path>${C.reset}  Path to JSON payload file
                    (default: test-payloads/jira-realistic-task.json)
  ${C.cyan}--key <key>${C.reset}       Override Jira issue key (e.g. TEST-200)
                    Use a unique key to avoid duplicate-task skips
                    Tip: --key TEST-$(date +%s)
  ${C.cyan}--gateway <url>${C.reset}   Gateway base URL (default: http://localhost:3000)
  ${C.cyan}--timeout <mins>${C.reset}  Max minutes to wait for task completion (default: 20)
  ${C.cyan}--help${C.reset}            Show this help

${C.bold}Examples:${C.reset}
  npx tsx scripts/trigger-task.ts
  npx tsx scripts/trigger-task.ts --key TEST-$(date +%s)
  npx tsx scripts/trigger-task.ts --payload test-payloads/jira-realistic-task.json --key TEST-200
  npx tsx scripts/trigger-task.ts --gateway http://localhost:3000 --timeout 30

${C.bold}What it does:${C.reset}
  1. Reads payload JSON (raw bytes preserved for HMAC signing)
  2. Computes HMAC-SHA256 signature matching gateway validation
  3. POSTs to /webhooks/jira — expects HTTP 200
  4. Waits for task row to appear in the database
  5. Polls status every 30s until Done/Error/Cancelled/Timeout
  6. Reports PR URL on success
`);
  process.exit(0);
}

// ─── .env loader ──────────────────────────────────────────────────────────────

/**
 * Parse .env file into a Record<string, string>.
 * Strips surrounding double-quotes from values (e.g. VAR="value" → "value").
 * Does NOT set process.env — returns an object for explicit access.
 */
function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  if (!existsSync('.env')) return env;
  const content = readFileSync('.env', 'utf8');
  for (const line of content.split('\n')) {
    // Match KEY=value or KEY="value" — skip comments and blank lines
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) {
      env[match[1]] = match[2].replace(/^"|"$/g, '').replace(/^'|'$/g, '');
    }
  }
  return env;
}

const dotenv = loadEnv();

// Prefer process.env overrides (e.g. JIRA_WEBHOOK_SECRET=wrong npx tsx ...)
// Fall back to .env file values
function getEnv(key: string): string {
  return process.env[key] ?? dotenv[key] ?? '';
}

// ─── Config resolution ────────────────────────────────────────────────────────

const PAYLOAD_PATH = getArg('--payload') ?? 'test-payloads/jira-realistic-task.json';
const ISSUE_KEY_OVERRIDE = getArg('--key');
const GATEWAY_BASE = getArg('--gateway') ?? 'http://localhost:3000';
const TIMEOUT_MINS = parseInt(getArg('--timeout') ?? '20', 10);
const WEBHOOK_ENDPOINT = `${GATEWAY_BASE}/webhooks/jira`;

const JIRA_SECRET = getEnv('JIRA_WEBHOOK_SECRET');
const DATABASE_URL = getEnv('DATABASE_URL');

// ─── Database helpers ─────────────────────────────────────────────────────────

/**
 * Parse a PostgreSQL connection URL into psql CLI arguments.
 *
 * Format: postgresql://user:password@host:port/dbname
 * Returns env vars + CLI flags needed to run psql non-interactively.
 */
function parseDatabaseUrl(url: string): {
  host: string;
  port: string;
  user: string;
  password: string;
  dbname: string;
} {
  try {
    // Use URL class — handles all standard postgres URL formats
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port || '5432',
      user: parsed.username,
      password: parsed.password,
      dbname: parsed.pathname.replace(/^\//, ''), // strip leading slash
    };
  } catch {
    throw new Error(`Invalid DATABASE_URL: ${url}`);
  }
}

/**
 * Execute a SQL query via psql and return trimmed stdout.
 * Uses PGPASSWORD env var to avoid password prompts.
 */
async function psqlQuery(sql: string): Promise<string> {
  if (!DATABASE_URL) throw new Error('DATABASE_URL not set in .env');
  const db = parseDatabaseUrl(DATABASE_URL);

  // -t = tuples-only (no headers/footers), -A = unaligned (no padding)
  const result =
    await $`env PGPASSWORD=${db.password} psql -h ${db.host} -p ${db.port} -U ${db.user} -d ${db.dbname} -t -A -c ${sql} 2>/dev/null`;
  return result.stdout.trim();
}

/**
 * Poll until a task row appears for the given Jira issue key.
 * Waits up to 10 seconds (10 × 1s intervals) for the gateway to write the row.
 *
 * Returns the task UUID or throws if not found within the timeout.
 */
async function waitForTaskId(issueKey: string): Promise<string> {
  const sql = `SELECT id FROM tasks WHERE external_id = '${issueKey}' ORDER BY created_at DESC LIMIT 1`;

  for (let attempt = 1; attempt <= 10; attempt++) {
    const taskId = await psqlQuery(sql).catch(() => '');
    if (taskId && taskId.length > 0) return taskId;
    if (attempt < 10) {
      process.stdout.write(attempt === 1 ? `  ${C.dim}waiting for DB row` : '.');
      await sleep(1000);
    }
  }
  if (process.stdout.isTTY) process.stdout.write('\n');

  throw new Error(
    `Task not found in DB for issue key "${issueKey}" after 10s.\n` +
      `Check that the gateway is running and the project "${issueKey.split('-')[0]}" is seeded.`,
  );
}

/**
 * Get the current status of a task by UUID.
 * Returns { status, dispatch_attempts } or null if the row is missing.
 */
async function getTaskStatus(
  taskId: string,
): Promise<{ status: string; dispatchAttempts: number } | null> {
  const sql = `SELECT status, dispatch_attempts FROM tasks WHERE id = '${taskId}' LIMIT 1`;
  const row = await psqlQuery(sql).catch(() => '');
  if (!row) return null;
  const [taskStatus, dispatchStr] = row.split('|');
  return {
    status: (taskStatus ?? '').trim(),
    dispatchAttempts: parseInt(dispatchStr ?? '0', 10),
  };
}

/**
 * Get the PR URL from the deliverables table once the task is Done.
 * Returns undefined if no PR deliverable exists yet.
 */
async function getPrUrl(taskId: string): Promise<string | undefined> {
  const sql = `SELECT d.external_ref FROM deliverables d JOIN executions e ON d.execution_id = e.id WHERE e.task_id = '${taskId}' AND d.delivery_type = 'pull_request' LIMIT 1`;
  const ref = await psqlQuery(sql).catch(() => '');
  return ref || undefined;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(startMs: number): string {
  const secs = Math.floor((Date.now() - startMs) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startMs = Date.now();

  // ── 1. Validate config ────────────────────────────────────────────────────

  section('Configuration');

  if (!JIRA_SECRET) {
    fail('JIRA_WEBHOOK_SECRET not set — add it to .env or pass as env var');
    fail('Example: JIRA_WEBHOOK_SECRET=test-secret npx tsx scripts/trigger-task.ts');
    process.exit(1);
  }

  if (!existsSync(PAYLOAD_PATH)) {
    fail(`Payload file not found: ${PAYLOAD_PATH}`);
    fail('Run from the repo root or specify --payload <path>');
    process.exit(1);
  }

  status('payload', PAYLOAD_PATH);
  status('gateway', WEBHOOK_ENDPOINT);
  status('timeout', `${TIMEOUT_MINS} minutes`);
  if (ISSUE_KEY_OVERRIDE) status('key override', ISSUE_KEY_OVERRIDE);

  // ── 2. Build rawBody (exact bytes to sign AND send) ───────────────────────
  //
  // CRITICAL: The gateway uses fastify-raw-body to capture the exact request
  // bytes, then computes HMAC over those bytes. We must:
  //   a) Decide on rawBody first (with any --key mutation applied)
  //   b) Compute HMAC over rawBody
  //   c) Send rawBody as the request body WITHOUT re-serialization
  //
  // If we re-serialized JSON.stringify(JSON.parse(rawBody)), whitespace would
  // change and the HMAC would not match.

  section('Payload');

  // Read the file as a raw string — preserves original JSON formatting/whitespace
  const fileContents = readFileSync(PAYLOAD_PATH, 'utf8');

  let rawBody: string;
  let issueKey: string;

  if (ISSUE_KEY_OVERRIDE) {
    // Parse → mutate → stringify. The stringified form IS the rawBody.
    // We do NOT use the original file bytes because the key changed.
    // The signed bytes and sent bytes are both the re-stringified form.
    const parsed = JSON.parse(fileContents);
    parsed.issue.key = ISSUE_KEY_OVERRIDE;
    // Also update the issue.id to avoid accidental duplicates (optional)
    rawBody = JSON.stringify(parsed, null, 2);
    issueKey = ISSUE_KEY_OVERRIDE;
    info(`Issue key overridden → ${C.bold}${issueKey}${C.reset}`);
  } else {
    // Use exact file bytes — no mutation, no re-serialization
    rawBody = fileContents;
    const parsed = JSON.parse(fileContents);
    issueKey = parsed?.issue?.key ?? 'UNKNOWN';
    info(`Issue key from file: ${C.bold}${issueKey}${C.reset}`);
  }

  info(`Payload size: ${rawBody.length} bytes`);

  // ── 3. Compute HMAC-SHA256 signature ──────────────────────────────────────
  //
  // Algorithm matches src/gateway/validation/signature.ts exactly:
  //   crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  //   → "sha256=<hex>"
  //
  // The gateway header name is X-Hub-Signature (not X-Hub-Signature-256).

  section('HMAC Signature');

  const hmacHex = createHmac('sha256', JIRA_SECRET).update(rawBody).digest('hex');
  const signatureHeader = `sha256=${hmacHex}`;

  ok('HMAC computed', `sha256=${hmacHex.slice(0, 12)}...`);

  // ── 4. Send webhook ───────────────────────────────────────────────────────
  //
  // Using Node.js native fetch() (Node ≥ 18).
  // - Content-Type: application/json  (required by gateway schema validation)
  // - X-Hub-Signature: sha256=<hex>   (verified by verifyJiraSignature())
  // - body: rawBody string — NOT re-serialized

  section('Webhook Request');

  info(`POST ${WEBHOOK_ENDPOINT}`);

  let response: Response;
  try {
    response = await fetch(WEBHOOK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature': signatureHeader,
      },
      body: rawBody, // exact string — matches what was signed
    });
  } catch (err) {
    // Network error — gateway not running or wrong URL
    const msg = err instanceof Error ? err.message : String(err);
    fail(`Network error reaching ${WEBHOOK_ENDPOINT}`);
    fail(`  ${msg}`);
    fail('Is the gateway running? Start it with: pnpm dev:start');
    process.exit(1);
  }

  const responseText = await response.text();
  let responseJson: Record<string, unknown> = {};
  try {
    responseJson = JSON.parse(responseText);
  } catch {
    // Non-JSON response — print as-is below
  }

  if (response.status === 401) {
    fail(`HTTP 401 — Invalid signature`);
    fail(`Gateway rejected HMAC. Check JIRA_WEBHOOK_SECRET matches the gateway's secret.`);
    fail(`  Response: ${responseText}`);
    process.exit(1);
  }

  if (response.status === 400) {
    fail(`HTTP 400 — Invalid payload`);
    fail(`The payload failed schema validation.`);
    fail(`  Response: ${responseText}`);
    process.exit(1);
  }

  if (response.status !== 200 && response.status !== 202) {
    fail(`HTTP ${response.status} — Unexpected response`);
    fail(`  Response: ${responseText}`);
    process.exit(1);
  }

  ok(`HTTP ${response.status}`, `action=${responseJson.action ?? 'unknown'}`);

  // Check for special actions that don't create new tasks
  const action = String(responseJson.action ?? '');

  if (action === 'duplicate') {
    warn('Duplicate webhook — task already exists for this issue key');
    warn(`Use --key with a unique value to create a new task, e.g. --key TEST-$(date +%s)`);
    // Still try to look up the task ID for monitoring
  }

  if (action === 'project_not_registered') {
    fail(`Project not registered in the database`);
    fail(`The Jira project key "${issueKey.split('-')[0]}" has no entry in the projects table.`);
    fail(`Run: pnpm setup  to seed the database with the test project.`);
    process.exit(1);
  }

  if (action === 'ignored') {
    warn('Webhook event was ignored by the gateway (not jira:issue_created)');
    warn('Check webhookEvent field in the payload.');
    process.exit(0);
  }

  // Extract taskId from response — gateway returns it when action=task_created
  // or action=queued_without_inngest. For duplicates, we look it up in the DB.
  let taskId = String(responseJson.taskId ?? '');

  if (taskId) {
    ok(`Task ID from response`, taskId);
  }

  // ── 5. Wait for task row in DB (and resolve task ID if not in response) ───

  section('Database');

  if (!DATABASE_URL) {
    warn('DATABASE_URL not set — skipping status monitoring');
    warn('Add DATABASE_URL to .env to enable polling.');
    if (taskId) {
      console.log(`\n${C.green}Task created:${C.reset} ${C.bold}${taskId}${C.reset}`);
    }
    process.exit(0);
  }

  info(`Waiting for task row (issue key: ${issueKey})...`);
  const resolvedTaskId = await waitForTaskId(issueKey).catch((err) => {
    console.log(); // newline after progress dots
    fail(String(err));
    process.exit(1);
  });

  console.log(); // newline after progress dots
  if (!taskId) taskId = resolvedTaskId;
  ok(`Task found in DB`, taskId);

  // ── 6. Monitor status until terminal state or timeout ─────────────────────
  //
  // Task status lifecycle (from Prisma schema):
  //   Ready → Executing → Submitting → Done
  //                     → Error
  //                     → Cancelled
  //
  // We poll every 30 seconds. Terminal states: Done, Error, Cancelled.
  // Timeout after --timeout minutes (default 20).

  section('Monitoring');

  info(
    `Polling every 30s (monitoring timeout: ${TIMEOUT_MINS} min, override with --timeout <mins>)`,
  );
  info(`Task ID: ${C.bold}${taskId}${C.reset}`);

  console.log(`\n  ${C.dim}Useful commands while waiting:${C.reset}`);
  console.log(
    `  ${C.dim}  docker logs -f ai-worker-${taskId.slice(0, 8)}${C.reset}  ${C.dim}# Worker container logs${C.reset}`,
  );
  console.log(
    `  ${C.dim}  open http://localhost:8288${C.reset}                      ${C.dim}# Inngest dashboard${C.reset}`,
  );
  console.log();

  const timeoutMs = TIMEOUT_MINS * 60 * 1000;
  const pollIntervalMs = 30_000;

  let lastStatus = '';
  let lastPrintedStatus = '';
  let consecutiveErrors = 0;

  while (Date.now() - startMs < timeoutMs) {
    const row = await getTaskStatus(taskId).catch(() => null);

    if (!row) {
      consecutiveErrors++;
      if (consecutiveErrors >= 3) {
        fail('Failed to read task status from DB 3 times in a row');
        fail('Check DATABASE_URL and that Supabase is running: pnpm dev:start');
        process.exit(1);
      }
      warn(`DB read failed (attempt ${consecutiveErrors}/3) — retrying...`);
      await sleep(pollIntervalMs);
      continue;
    }

    consecutiveErrors = 0;
    const { status: taskStatus, dispatchAttempts } = row;

    if (taskStatus !== lastStatus) {
      if (lastPrintedStatus) process.stdout.write('\n');
      const elapsed = formatDuration(startMs);
      const dispatchNote = dispatchAttempts > 0 ? ` (dispatch attempts: ${dispatchAttempts})` : '';
      console.log(
        `  ${C.dim}[${elapsed}]${C.reset} ${C.bold}${taskStatus}${C.reset}${C.dim}${dispatchNote}${C.reset}`,
      );
      lastStatus = taskStatus;
      lastPrintedStatus = '';
    } else {
      process.stdout.write('.');
      lastPrintedStatus = taskStatus;
    }

    // ── Terminal states ───────────────────────────────────────────────────

    if (taskStatus === 'Done') {
      if (lastPrintedStatus) process.stdout.write('\n');
      section('Result');
      ok(`Task completed`, formatDuration(startMs));

      // Look up PR URL from deliverables table
      const prUrl = await getPrUrl(taskId);
      if (prUrl) {
        ok(`Pull Request`, prUrl);
        console.log(`\n${C.bold}${C.green}✓ PR URL:${C.reset} ${C.bold}${prUrl}${C.reset}\n`);
      } else {
        warn('No PR URL found in deliverables table');
        warn('Task is Done but no pull_request deliverable was recorded.');
      }

      console.log(`${C.bold}${C.green}Task completed successfully!${C.reset}`);
      console.log(`  Task ID:  ${taskId}`);
      console.log(`  Duration: ${formatDuration(startMs)}`);
      process.exit(0);
    }

    if (taskStatus === 'Error') {
      if (lastPrintedStatus) process.stdout.write('\n');
      section('Result');
      fail(`Task ended with Error`);
      fail(`Duration: ${formatDuration(startMs)}`);
      fail(`Task ID:  ${taskId}`);
      fail(`Check Inngest dashboard: http://localhost:8288`);
      process.exit(1);
    }

    if (taskStatus === 'Cancelled') {
      if (lastPrintedStatus) process.stdout.write('\n');
      section('Result');
      warn('Task was cancelled');
      console.log(`  Task ID:  ${taskId}`);
      console.log(`  Duration: ${formatDuration(startMs)}`);
      process.exit(1);
    }

    // Not terminal — wait and poll again
    await sleep(pollIntervalMs);
  }

  // Timeout reached
  section('Timeout');
  fail(`Timed out after ${TIMEOUT_MINS} minutes`);
  fail(`Task did not reach a terminal state.`);
  fail(`Last status: ${lastStatus || 'unknown'}`);
  fail(`Task ID: ${taskId}`);
  fail(`Check Inngest dashboard: http://localhost:8288`);
  process.exit(1);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

main().catch((err) => {
  fail(`Unhandled error: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) {
    console.error(C.dim + err.stack + C.reset);
  }
  process.exit(1);
});
