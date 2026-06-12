/**
 * Shared helpers extracted from opencode-harness.mts.
 *
 * Functions here have no dependency on module-level singletons — every
 * caller passes `taskId` (and `db` where needed) explicitly, making the
 * helpers independently testable.
 */

import { readdirSync, rmSync, type Dirent } from 'node:fs';
import { join } from 'node:path';

import { createLogger } from '../../lib/logger.js';
import { INNGEST_EVENT_KEY, INNGEST_BASE_URL } from '../../lib/config.js';
import { type PostgRESTClient } from './postgrest-client.js';
import { type StandardOutput } from './output-schema.mjs';
import { postApprovalCard } from './approval-card-poster.mjs';
import { updateSlackNotificationToFailed } from './slack-notifier.mjs';

const log = createLogger('harness-helpers');

// ---------------------------------------------------------------------------
// markFailed
// ---------------------------------------------------------------------------

/**
 * Patch the task to Failed, write a task_status_log row, and optionally
 * update the Slack "Received" notification. Never throws.
 */
export async function markFailed(
  taskId: string,
  db: PostgRESTClient,
  reason: string,
  executionId: string | null,
  fromStatus: string,
  failureCode?: string,
): Promise<void> {
  try {
    await db.patch('tasks', `id=eq.${taskId}`, {
      status: 'Failed',
      failure_reason: reason,
      failure_code: failureCode ?? null,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    log.warn({ err }, '[opencode-harness] Failed to PATCH task status to Failed');
  }
  try {
    await db.post('task_status_log', {
      task_id: taskId,
      from_status: fromStatus,
      to_status: 'Failed',
      actor: 'machine',
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    log.warn({ err }, '[opencode-harness] Failed to log status transition to Failed (non-fatal)');
  }

  if (executionId) {
    try {
      await db.patch('executions', `id=eq.${executionId}`, {
        status: 'failed',
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      log.warn({ err }, '[opencode-harness] Failed to PATCH execution status to failed');
    }
  }

  // Update the Slack "Received" notification to show failure state (non-fatal)
  await updateSlackNotificationToFailed(taskId, reason, {
    roleName: process.env['EMPLOYEE_ROLE_NAME'] ?? 'Employee',
    slackToken: process.env['SLACK_BOT_TOKEN'],
    slackChannel: process.env['NOTIFICATION_CHANNEL'],
    slackMsgTs: process.env['NOTIFY_MSG_TS'],
  });
}

// ---------------------------------------------------------------------------
// fireCompletionEvent
// ---------------------------------------------------------------------------

/**
 * Fire `employee/task.completed` to Inngest. Non-fatal — watchdog recovers
 * if this fails.
 */
export async function fireCompletionEvent(taskId: string): Promise<void> {
  const baseUrl = INNGEST_BASE_URL;
  const eventKey = INNGEST_EVENT_KEY;
  const url = `${baseUrl}/e/${eventKey}`;

  const payload = {
    name: 'employee/task.completed',
    id: `employee-complete-${taskId}`,
    data: { taskId },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      log.info({ taskId }, 'Inngest event fired: employee/task.completed');
    } else {
      log.warn(
        { taskId, httpStatus: response.status },
        '[opencode-harness] Inngest event returned non-OK status — watchdog will recover',
      );
    }
  } catch (err) {
    log.warn(
      { taskId, err },
      '[opencode-harness] Failed to fire Inngest completion event — watchdog will recover',
    );
  }
}

// ---------------------------------------------------------------------------
// tryAutoPostApprovalCard
// ---------------------------------------------------------------------------

/**
 * Auto-post an approval card to Slack when the agent wrote a standard-schema
 * summary.txt with NEEDS_APPROVAL but did not post a card itself.
 * Wrapped in try/catch — never throws.
 */
export async function tryAutoPostApprovalCard(
  taskId: string,
  parsedOutput: StandardOutput,
): Promise<Record<string, unknown>> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.NOTIFICATION_CHANNEL;

  if (!token || !channel) {
    log.warn(
      { taskId, hasToken: !!token, hasChannel: !!channel },
      '[opencode-harness] Cannot auto-post approval card — missing SLACK_BOT_TOKEN or NOTIFICATION_CHANNEL',
    );
    return {};
  }

  try {
    const result = await postApprovalCard({
      data: parsedOutput,
      taskId,
      channel,
      token,
      threadTs: process.env['NOTIFY_MSG_TS'] || undefined,
    });

    // Build rich metadata so the lifecycle can render context thread replies,
    // Done-state notifications, and delivery without null fields.
    const agentMeta = parsedOutput.metadata ?? {};
    const approvalMeta: Record<string, unknown> = {
      ts: result.ts,
      channel: result.channel,
      approval_message_ts: result.ts,
      target_channel: result.channel,
      // Delivery payload
      ...(parsedOutput.draft !== undefined && { draft_response: parsedOutput.draft }),
      // Confidence as a 0–1 number (not a percentage string)
      ...(parsedOutput.confidence !== undefined && { confidence: parsedOutput.confidence }),
      // Thread / conversation routing (from env vars injected by lifecycle)
      ...(process.env.THREAD_UID && {
        thread_uid: process.env.THREAD_UID,
        conversation_ref: process.env.THREAD_UID,
      }),
      ...(process.env.LEAD_UID && { lead_uid: process.env.LEAD_UID }),
      // Rich display fields written by the agent into StandardOutput.metadata
      ...(agentMeta['guest_name'] !== undefined && { guest_name: agentMeta['guest_name'] }),
      ...(agentMeta['property_name'] !== undefined && {
        property_name: agentMeta['property_name'],
      }),
      ...(agentMeta['original_message'] !== undefined && {
        original_message: agentMeta['original_message'],
      }),
      ...(agentMeta['check_in'] !== undefined && { check_in: agentMeta['check_in'] }),
      ...(agentMeta['check_out'] !== undefined && { check_out: agentMeta['check_out'] }),
      ...(agentMeta['booking_channel'] !== undefined && {
        booking_channel: agentMeta['booking_channel'],
      }),
      ...(agentMeta['lead_status'] !== undefined && { lead_status: agentMeta['lead_status'] }),
      ...(agentMeta['category'] !== undefined && { category: agentMeta['category'] }),
    };

    const { writeFile } = await import('fs/promises');
    await writeFile('/tmp/approval-message.json', JSON.stringify(approvalMeta), 'utf8');

    log.info(
      { taskId, ts: result.ts, channel: result.channel },
      '[opencode-harness] Auto-posted approval card and wrote /tmp/approval-message.json',
    );

    return approvalMeta;
  } catch (err) {
    log.error(
      { taskId, err },
      '[opencode-harness] Failed to auto-post approval card — continuing without card',
    );
    return {};
  }
}

// ---------------------------------------------------------------------------
// writeOpencodeAuth
// ---------------------------------------------------------------------------

/**
 * Write auth.json and opencode.json config files required by the OpenCode
 * server. Called once before starting the execution or delivery session.
 */
export async function writeOpencodeAuth(temperature: number = 1.0): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    log.warn('[opencode-harness] OPENROUTER_API_KEY not set — OpenCode may fail to authenticate');
    return;
  }
  const { mkdir, writeFile } = await import('fs/promises');
  const { homedir } = await import('os');
  const { join } = await import('path');
  const authDir = join(homedir(), '.local', 'share', 'opencode');
  await mkdir(authDir, { recursive: true });
  const goApiKey = process.env.OPENCODE_GO_API_KEY;
  const authProviders: Record<string, { type: string; key: string }> = {
    openrouter: { type: 'api', key: apiKey },
  };
  if (goApiKey) {
    authProviders['opencode-go'] = { type: 'api', key: goApiKey };
  }
  const authJson = JSON.stringify(authProviders, null, 2);
  await writeFile(join(authDir, 'auth.json'), authJson, 'utf8');
  log.info({ goProviderEnabled: Boolean(goApiKey) }, '[opencode-harness] auth.json written');

  const configDir = join(process.cwd(), '.opencode');
  await mkdir(configDir, { recursive: true });
  // The "*": "allow" wildcard covers all permission types including "skill" — no explicit skill permission needed
  const configJson = JSON.stringify(
    {
      provider: {
        'opencode-go': {
          options: {
            baseURL: 'https://opencode.ai/zen/go/v1',
          },
        },
      },
      agent: { build: { temperature } },
      permission: { '*': 'allow', question: 'deny' },
      autoupdate: false,
    },
    null,
    2,
  );
  await writeFile(join(configDir, 'opencode.json'), configJson, 'utf8');
  log.info({ temperature }, '[opencode-harness] opencode.json permission config written');

  // Also write global config to prevent auto-update at the global level
  const globalConfigDir = join(homedir(), '.config', 'opencode');
  await mkdir(globalConfigDir, { recursive: true });
  const globalConfigJson = JSON.stringify({ autoupdate: false }, null, 2);
  await writeFile(join(globalConfigDir, 'opencode.json'), globalConfigJson, 'utf8');
  log.info('[opencode-harness] global opencode.json written (autoupdate: false)');

  // Log available skills baked into the container image
  const skillsDir = SKILLS_DIR;
  try {
    const { readdirSync } = await import('fs');
    const entries = readdirSync(skillsDir, { withFileTypes: true });
    const skills = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    log.info({ skills }, '[opencode-harness] Skills available in container');
  } catch {
    log.info('[opencode-harness] No skills directory found — container has no baked-in skills');
  }
}

// ---------------------------------------------------------------------------
// filterComposioSkills
// ---------------------------------------------------------------------------

/** Baked-in OpenCode skills directory inside the worker container image. */
const SKILLS_DIR = '/app/.opencode/skills';

/** Prefix marking a per-app Composio skill folder (e.g. `composio-notion`). */
const COMPOSIO_SKILL_PREFIX = 'composio-';

/**
 * Prune `composio-*` skill folders for apps the tenant has NOT connected.
 *
 * The container image bakes in one `composio-<app>` skill folder per supported
 * app. At runtime only the apps the tenant has actually connected should be
 * visible to the agent, so we delete the folders whose app slug is absent from
 * `connectedToolkits`. Non-Composio skills are never touched.
 *
 * MUST run AFTER `loadConnectedToolkits()` and BEFORE the OpenCode server boots
 * — OpenCode scans the skills directory once at startup with no hot reload.
 *
 * Never throws: a missing skills directory (or any per-entry error) is a no-op.
 */
export function filterComposioSkills(connectedToolkits: string[]): void {
  // Case-insensitive connected set — DB toolkit slugs and folder slugs may differ in case.
  const connected = new Set(connectedToolkits.map((t) => t.toLowerCase()));

  let entries: Dirent[];
  try {
    entries = readdirSync(SKILLS_DIR, { withFileTypes: true });
  } catch {
    // Directory absent (e.g. container without baked-in skills) — nothing to prune.
    log.info('[opencode-harness] No skills directory found — skipping Composio skill filtering');
    return;
  }

  const kept: string[] = [];
  const removed: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    if (!name.startsWith(COMPOSIO_SKILL_PREFIX)) continue; // Never touch non-Composio skills.

    const appSlug = name.slice(COMPOSIO_SKILL_PREFIX.length).toLowerCase();
    if (connected.has(appSlug)) {
      kept.push(name);
      continue;
    }

    try {
      rmSync(join(SKILLS_DIR, name), { recursive: true, force: true });
      removed.push(name);
    } catch (err) {
      // A failed delete is non-fatal — log and leave the folder in place.
      log.warn({ err, skill: name }, '[opencode-harness] Failed to remove Composio skill folder');
    }
  }

  log.info(
    { connectedToolkits: [...connected], kept, removed },
    '[opencode-harness] Composio skill folders filtered',
  );
}
