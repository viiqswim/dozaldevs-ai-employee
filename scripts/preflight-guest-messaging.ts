#!/usr/bin/env tsx
/**
 * preflight-guest-messaging.ts — Diagnostic preflight for guest-messaging test suite
 *
 * Runs 12 prerequisite checks and auto-fixes what it can (checks 9 and 11).
 *
 * Usage:
 *   npx tsx scripts/preflight-guest-messaging.ts
 *   npx tsx scripts/preflight-guest-messaging.ts --help
 *
 * Exit codes:
 *   0 — all checks passed (or auto-fixed)
 *   1 — one or more checks failed
 */

import { $ } from 'zx';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

$.verbose = false;

// ─── Env loading ──────────────────────────────────────────────────────────────

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

// ─── Colors ──────────────────────────────────────────────────────────────────

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

// ─── Output helpers ───────────────────────────────────────────────────────────

function ok(msg: string, detail?: string) {
  console.log(`${C.green}✓${C.reset} ${msg}${detail ? ` ${C.cyan}(${detail})${C.reset}` : ''}`);
}
function fail(msg: string, detail?: string) {
  console.error(`${C.red}✗${C.reset} ${msg}${detail ? ` — ${detail}` : ''}`);
}
function warn(msg: string) {
  console.log(`${C.yellow}⚠${C.reset} ${msg}`);
}
function section(name: string) {
  console.log(`\n${C.bold}${C.cyan}── ${name} ──${C.reset}`);
}
function fixed(msg: string, detail?: string) {
  console.log(`${C.yellow}🔧${C.reset} ${msg}${detail ? ` ${C.cyan}(${detail})${C.reset}` : ''}`);
}

// ─── Counters ─────────────────────────────────────────────────────────────────

let PASS = 0;
let FAIL = 0;
let FIXED = 0;

function checkPass(label: string, detail?: string): void {
  PASS++;
  ok(label, detail);
}
function checkFail(label: string, detail?: string): void {
  FAIL++;
  fail(label, detail);
}
function checkFixed(label: string, detail?: string): void {
  FIXED++;
  fixed(label, detail);
}

// ─── Help flag ────────────────────────────────────────────────────────────────

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
${C.bold}preflight-guest-messaging${C.reset} — Diagnostic preflight for guest-messaging employee

${C.bold}Usage:${C.reset}
  npx tsx scripts/preflight-guest-messaging.ts
  npx tsx scripts/preflight-guest-messaging.ts --help

${C.bold}What it checks:${C.reset}
  1.  Environment variables (11 required vars)
  2.  Docker daemon running
  3.  cloudflared on PATH
  4.  Cloudflare tunnel config exists (~/.cloudflared/ai-employee-local.yml)
  5.  Gateway health (http://localhost:7700/health)
  6.  Cloudflare tunnel reachable (local-ai-employee.dozaldevs.com)
  7.  VLRE tenant in DB
  8.  Guest-messaging archetype in DB
  9.  Hostfully tenant secrets in DB (hostfully_api_key + hostfully_agency_uid; auto-fixes agency UID)
  10. VLRE Slack OAuth connected
  11. Hostfully webhook registered (auto-registers if missing; skipped if HOSTFULLY_API_KEY not in .env)
  12. Webhook receiver smoke test

${C.bold}Exit codes:${C.reset}
  0 — all checks passed or auto-fixed
  1 — one or more checks failed
`);
  process.exit(0);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Guest Messaging — Preflight Diagnostic            ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  const TENANT_ID = '00000000-0000-0000-0000-000000000003';
  const ARCHETYPE_ID = '00000000-0000-0000-0000-000000000015';
  const GATEWAY = 'http://localhost:7700';
  const POSTGREST = `${getEnv('SUPABASE_URL') || 'http://localhost:54331'}/rest/v1`;
  const HOSTFULLY_BASE = 'https://api.hostfully.com/api/v3.2';

  const ADMIN_API_KEY = getEnv('ADMIN_API_KEY');
  const SUPABASE_SECRET_KEY = getEnv('SUPABASE_SECRET_KEY');
  const WEBHOOK_PUBLIC_URL = getEnv('WEBHOOK_PUBLIC_URL');

  let agencyUid = '';

  // ─── Check 1 — Env vars present ─────────────────────────────────────────────
  section('Check 1 · Environment Variables');
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
    'WEBHOOK_PUBLIC_URL',
  ];
  const missing: string[] = [];
  for (const v of REQUIRED_VARS) {
    const val = getEnv(v);
    if (val) {
      console.log(`  ${C.green}✓${C.reset} ${v}`);
    } else {
      console.log(`  ${C.red}✗${C.reset} ${v} ${C.dim}(missing or empty)${C.reset}`);
      missing.push(v);
    }
  }
  if (missing.length === 0) {
    checkPass('All 11 required env vars present');
  } else {
    checkFail(`${missing.length} env var(s) missing`, missing.join(', '));
  }

  // ─── Check 2 — Docker running ────────────────────────────────────────────────
  section('Check 2 · Docker');
  try {
    const r = await $`docker info --format {{.ServerVersion}}`.nothrow();
    if (r.exitCode === 0 && r.stdout.trim()) {
      checkPass('Docker daemon running', `v${r.stdout.trim()}`);
    } else {
      checkFail('Docker daemon not running', 'Start Docker Desktop');
    }
  } catch {
    checkFail('Docker daemon not running', 'Start Docker Desktop');
  }

  // ─── Check 3 — cloudflared on PATH ──────────────────────────────────────────
  section('Check 3 · cloudflared');
  try {
    const r = await $`cloudflared --version`.nothrow();
    if (r.exitCode === 0) {
      checkPass('cloudflared on PATH', r.stdout.trim().split('\n')[0]);
    } else {
      checkFail('cloudflared not found', 'brew install cloudflared');
    }
  } catch {
    checkFail('cloudflared not found', 'brew install cloudflared');
  }

  // ─── Check 4 — Tunnel config exists ─────────────────────────────────────────
  section('Check 4 · Tunnel Config');
  const tunnelConfigPath = resolve(homedir(), '.cloudflared/ai-employee-local.yml');
  if (existsSync(tunnelConfigPath)) {
    checkPass('Tunnel config exists', tunnelConfigPath);
  } else {
    checkFail(
      'Tunnel config missing',
      `Expected: ${tunnelConfigPath} — See docs/2026-05-02-1934-cloudflare-tunnel-and-hostfully-webhook-setup.md`,
    );
  }

  // ─── Check 5 — Gateway health ────────────────────────────────────────────────
  section('Check 5 · Gateway Health');
  try {
    const r = await fetch(`${GATEWAY}/health`);
    const body = (await r.json()) as { status?: string };
    if (r.ok && body.status === 'ok') {
      checkPass('Gateway healthy', GATEWAY);
    } else {
      checkFail(
        'Gateway returned unexpected response',
        `status=${r.status} body=${JSON.stringify(body)}`,
      );
    }
  } catch (e) {
    checkFail(
      'Gateway unreachable',
      `Start the stack: pnpm dev:local (error: ${e instanceof Error ? e.message : String(e)})`,
    );
  }

  // ─── Check 6 — Tunnel reachable ──────────────────────────────────────────────
  section('Check 6 · Cloudflare Tunnel');
  try {
    const r = await fetch('https://local-ai-employee.dozaldevs.com/health');
    const body = (await r.json()) as { status?: string };
    if (r.ok && body.status === 'ok') {
      checkPass('Tunnel reachable', 'local-ai-employee.dozaldevs.com');
    } else {
      checkFail('Tunnel returned unexpected response', `status=${r.status}`);
    }
  } catch (e) {
    checkFail(
      'Tunnel unreachable',
      `Tunnel not connected — check cloudflared logs (error: ${e instanceof Error ? e.message : String(e)})`,
    );
  }

  // ─── Check 7 — VLRE tenant in DB ────────────────────────────────────────────
  section('Check 7 · VLRE Tenant');
  try {
    const r = await fetch(`${POSTGREST}/tenants?id=eq.${TENANT_ID}&select=id,name,slug`, {
      headers: {
        apikey: SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      },
    });
    const rows = (await r.json()) as Array<{ id: string; name: string; slug: string }>;
    if (Array.isArray(rows) && rows.length > 0) {
      checkPass('VLRE tenant exists', `${rows[0].name} (${rows[0].slug})`);
    } else {
      checkFail(
        'VLRE tenant not found in DB',
        'Run: pnpm prisma migrate deploy && pnpm prisma db seed',
      );
    }
  } catch (e) {
    checkFail('Could not query tenant', e instanceof Error ? e.message : String(e));
  }

  // ─── Check 8 — Guest-messaging archetype in DB ───────────────────────────────
  section('Check 8 · Guest-Messaging Archetype');
  try {
    const r = await fetch(`${POSTGREST}/archetypes?id=eq.${ARCHETYPE_ID}&select=id,role_name`, {
      headers: {
        apikey: SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      },
    });
    const rows = (await r.json()) as Array<{ id: string; role_name: string }>;
    if (Array.isArray(rows) && rows.length > 0) {
      checkPass('Guest-messaging archetype exists', rows[0].role_name);
    } else {
      checkFail('Guest-messaging archetype not found', 'Run: pnpm prisma db seed');
    }
  } catch (e) {
    checkFail('Could not query archetypes', e instanceof Error ? e.message : String(e));
  }

  // ─── Check 9 — Hostfully tenant secrets in DB ────────────────────────────────
  section('Check 9 · Hostfully Tenant Secrets');
  try {
    const r = await fetch(`${GATEWAY}/admin/tenants/${TENANT_ID}/secrets`, {
      headers: { 'X-Admin-Key': ADMIN_API_KEY },
    });
    const body = (await r.json()) as {
      secrets?: Array<{ key: string; is_set: boolean }>;
    };
    const secrets = body.secrets ?? [];

    const apiKeyEntry = secrets.find((s) => s.key === 'hostfully_api_key');
    let apiKeyOk = apiKeyEntry?.is_set === true;
    if (apiKeyOk) {
      ok('hostfully_api_key stored');
    } else {
      fail(
        'hostfully_api_key not stored',
        `Store via: curl -X PUT ${GATEWAY}/admin/tenants/${TENANT_ID}/secrets/hostfully_api_key` +
          ` -H "X-Admin-Key: <ADMIN_API_KEY>" -H "Content-Type: application/json"` +
          ` -d '{"value":"<your-hostfully-api-key>"}'`,
      );
    }

    const agencyUidEntry = secrets.find((s) => s.key === 'hostfully_agency_uid');
    let agencyUidOk = agencyUidEntry?.is_set === true;
    let anyFixed = false;
    if (agencyUidOk) {
      ok('hostfully_agency_uid stored');
    } else {
      warn('hostfully_agency_uid not stored — attempting auto-fix from tenant config...');
      try {
        const cfgR = await fetch(`${POSTGREST}/tenants?id=eq.${TENANT_ID}&select=config`, {
          headers: {
            apikey: SUPABASE_SECRET_KEY,
            Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
          },
        });
        const cfgRows = (await cfgR.json()) as Array<{
          config: { guest_messaging?: { hostfully_agency_uid?: string } };
        }>;
        const uid = cfgRows[0]?.config?.guest_messaging?.hostfully_agency_uid ?? '';
        if (uid) {
          const putR = await fetch(
            `${GATEWAY}/admin/tenants/${TENANT_ID}/secrets/hostfully_agency_uid`,
            {
              method: 'PUT',
              headers: { 'X-Admin-Key': ADMIN_API_KEY, 'Content-Type': 'application/json' },
              body: JSON.stringify({ value: uid }),
            },
          );
          if (putR.ok) {
            agencyUid = uid;
            agencyUidOk = true;
            anyFixed = true;
            fixed('hostfully_agency_uid auto-stored from tenant config');
          } else {
            fail('Auto-fix failed for hostfully_agency_uid', `status=${putR.status}`);
          }
        } else {
          fail(
            'hostfully_agency_uid not found in tenant config',
            'Check tenant.config.guest_messaging.hostfully_agency_uid in DB',
          );
        }
      } catch (e) {
        fail(
          'Could not fetch tenant config for agency UID',
          e instanceof Error ? e.message : String(e),
        );
      }
    }

    if (agencyUidOk && !agencyUid) {
      try {
        const cfgR = await fetch(`${POSTGREST}/tenants?id=eq.${TENANT_ID}&select=config`, {
          headers: {
            apikey: SUPABASE_SECRET_KEY,
            Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
          },
        });
        const cfgRows = (await cfgR.json()) as Array<{
          config: { guest_messaging?: { hostfully_agency_uid?: string } };
        }>;
        agencyUid = cfgRows[0]?.config?.guest_messaging?.hostfully_agency_uid ?? '';
      } catch {}
    }

    if (apiKeyOk && agencyUidOk && anyFixed) {
      checkFixed('Hostfully tenant secrets verified (agency UID auto-stored)');
    } else if (apiKeyOk && agencyUidOk) {
      checkPass('Hostfully tenant secrets verified');
    } else {
      checkFail('Hostfully tenant secrets incomplete — see details above');
    }
  } catch (e) {
    checkFail('Could not check tenant secrets', e instanceof Error ? e.message : String(e));
  }

  // ─── Check 10 — Slack OAuth connected ───────────────────────────────────────
  section('Check 10 · Slack OAuth');
  try {
    const r = await fetch(
      `${POSTGREST}/tenant_integrations?tenant_id=eq.${TENANT_ID}&provider=eq.slack&deleted_at=is.null&select=id,external_id`,
      {
        headers: {
          apikey: SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
        },
      },
    );
    const rows = (await r.json()) as Array<{ id: string; external_id: string }>;
    if (Array.isArray(rows) && rows.length > 0) {
      checkPass('VLRE Slack OAuth connected', `team: ${rows[0].external_id}`);
    } else {
      checkFail(
        'Slack OAuth not connected',
        `Run OAuth: ${GATEWAY}/slack/install?tenant=${TENANT_ID}`,
      );
    }
  } catch (e) {
    checkFail('Could not check Slack integration', e instanceof Error ? e.message : String(e));
  }

  // ─── Check 11 — Hostfully webhook registered (with auto-fix) ─────────────────
  section('Check 11 · Hostfully Webhook');
  const hostfullyApiKey = getEnv('HOSTFULLY_API_KEY');
  const targetUrl = `${WEBHOOK_PUBLIC_URL}/webhooks/hostfully`;

  if (!hostfullyApiKey) {
    warn('HOSTFULLY_API_KEY not in .env — skipping live webhook verification');
    warn('Add it to .env as a developer convenience to enable this check');
    checkPass('Hostfully webhook check skipped (secret stored in DB — see Check 9)');
  } else if (!WEBHOOK_PUBLIC_URL) {
    checkFail('Cannot check Hostfully webhook — WEBHOOK_PUBLIC_URL missing');
  } else {
    if (!agencyUid) {
      try {
        const cfgR = await fetch(`${POSTGREST}/tenants?id=eq.${TENANT_ID}&select=config`, {
          headers: {
            apikey: SUPABASE_SECRET_KEY,
            Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
          },
        });
        const cfgRows = (await cfgR.json()) as Array<{
          config: { guest_messaging?: { hostfully_agency_uid?: string } };
        }>;
        agencyUid = cfgRows[0]?.config?.guest_messaging?.hostfully_agency_uid ?? '';
      } catch {}
    }

    if (!agencyUid) {
      warn('Agency UID unavailable — skipping live Hostfully API call');
      checkFail('Cannot check Hostfully webhook — agency UID could not be resolved');
    } else {
      try {
        const r = await fetch(`${HOSTFULLY_BASE}/webhooks?agencyUid=${agencyUid}`, {
          headers: {
            'X-HOSTFULLY-APIKEY': hostfullyApiKey,
            'Content-Type': 'application/json',
          },
        });
        const body = (await r.json()) as {
          webhooks?: Array<{ eventType: string; callbackUrl: string }>;
        };
        const webhooks = body.webhooks ?? [];
        const exact = webhooks.find(
          (w) => w.eventType === 'NEW_INBOX_MESSAGE' && w.callbackUrl === targetUrl,
        );
        const wrongUrl = webhooks.find(
          (w) => w.eventType === 'NEW_INBOX_MESSAGE' && w.callbackUrl !== targetUrl,
        );

        if (exact) {
          checkPass('Hostfully webhook registered', targetUrl);
        } else if (wrongUrl) {
          warn(`Webhook exists but points to wrong URL: ${wrongUrl.callbackUrl}`);
          warn(`Expected: ${targetUrl}`);
          checkFail(
            'Hostfully webhook points to wrong URL',
            'Delete old webhook in Hostfully dashboard and re-run',
          );
        } else {
          warn('Hostfully webhook not found — auto-registering...');
          const postR = await fetch(`${HOSTFULLY_BASE}/webhooks`, {
            method: 'POST',
            headers: {
              'X-HOSTFULLY-APIKEY': hostfullyApiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              agencyUid,
              eventType: 'NEW_INBOX_MESSAGE',
              callbackUrl: targetUrl,
              webhookType: 'POST_JSON',
              objectUid: agencyUid,
            }),
          });
          if (postR.ok) {
            checkFixed('Hostfully webhook auto-registered', targetUrl);
          } else {
            const errBody = await postR.text();
            checkFail(
              'Auto-registration failed',
              `status=${postR.status} ${errBody.slice(0, 100)}`,
            );
          }
        }
      } catch (e) {
        checkFail('Could not check Hostfully webhooks', e instanceof Error ? e.message : String(e));
      }
    }
  }

  // ─── Check 12 — Webhook receiver smoke test ───────────────────────────────────
  section('Check 12 · Webhook Receiver Smoke Test');
  try {
    const messageUid = `preflight-${Date.now()}`;
    const r = await fetch(`${GATEWAY}/webhooks/hostfully`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agency_uid: agencyUid,
        event_type: 'NEW_INBOX_MESSAGE',
        message_uid: messageUid,
        thread_uid: '2f18249a-9523-4acd-a512-20ff06d5c3fa',
        lead_uid: '37f5f58f-d308-42bf-8ed3-f0c2d70f16fb',
        property_uid: 'c960c8d2-9a51-49d8-bb48-355a7bfbe7e2',
        message: 'Preflight smoke test — please ignore',
      }),
    });
    const body = (await r.json()) as { ok?: boolean; task_id?: string; duplicate?: boolean };
    if (r.ok && body.ok && body.task_id) {
      checkPass('Webhook receiver accepted payload', `task_id: ${body.task_id}`);
      warn(`Smoke test created a real task (${body.task_id}). Cancel it at: http://localhost:8288`);
    } else if (r.ok && body.ok && body.duplicate) {
      checkPass('Webhook receiver accepted payload (duplicate detected — OK for preflight)');
    } else {
      checkFail(
        'Webhook receiver rejected payload',
        `status=${r.status} body=${JSON.stringify(body)}`,
      );
    }
  } catch (e) {
    checkFail('Could not reach webhook receiver', e instanceof Error ? e.message : String(e));
  }

  // ─── Summary ──────────────────────────────────────────────────────────────────
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  if (FAIL === 0) {
    console.log(`║  ${C.green}✅  ALL ${PASS} CHECKS PASSED${C.reset}                         ║`);
  } else {
    console.log(
      `║  ${C.red}❌  ${PASS}/${PASS + FAIL + FIXED} passed · ${FAIL} failed · ${FIXED} auto-fixed${C.reset}    ║`,
    );
  }
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  process.exit(FAIL > 0 ? 1 : 0);
}

main().catch((err) => {
  fail(`Unhandled error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
