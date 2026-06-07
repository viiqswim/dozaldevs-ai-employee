import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('lifecycle-helpers');

export async function patchTask(
  supabaseUrl: string,
  headers: Record<string, string>,
  taskId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '(unreadable)');
    throw new Error(`patchTask failed: HTTP ${res.status} — ${body}`);
  }
}

export async function logStatusTransition(
  supabaseUrl: string,
  headers: Record<string, string>,
  taskId: string,
  toStatus: string,
  fromStatus?: string,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/rest/v1/task_status_log`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      task_id: taskId,
      from_status: fromStatus ?? null,
      to_status: toStatus,
      actor: 'lifecycle_fn',
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '(unreadable)');
    throw new Error(`logStatusTransition failed: HTTP ${res.status} — ${body}`);
  }
}

export async function recordWorkMetric(
  supabaseUrl: string,
  headers: Record<string, string>,
  taskId: string,
  archetypeId: string | null,
  tenantId: string,
): Promise<void> {
  if (!archetypeId) return;
  const archetypeRes = await fetch(
    `${supabaseUrl}/rest/v1/archetypes?id=eq.${archetypeId}&select=estimated_manual_minutes,estimated_manual_minutes_override`,
    { headers },
  );
  if (!archetypeRes.ok) return;
  const archetypes = (await archetypeRes.json()) as Array<{
    estimated_manual_minutes: number | null;
    estimated_manual_minutes_override: number | null;
  }>;
  const archetype = archetypes[0];
  if (!archetype) return;
  const effectiveMinutes =
    archetype.estimated_manual_minutes_override ?? archetype.estimated_manual_minutes;
  if (effectiveMinutes == null) return;
  const metricsRes = await fetch(`${supabaseUrl}/rest/v1/task_metrics`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({
      task_id: taskId,
      archetype_id: archetypeId,
      tenant_id: tenantId,
      work_minutes: effectiveMinutes,
    }),
  });
  if (!metricsRes.ok) {
    const body = await metricsRes.text().catch(() => '(unreadable)');
    log.warn(
      { taskId, status: metricsRes.status, body },
      'Failed to write task_metrics row — non-fatal',
    );
  }
}

export function runLocalDockerContainer(opts: {
  taskId: string;
  env: Record<string, string>;
  name: string;
  cmd?: string[];
}): { id: string } {
  stopLocalDockerContainer(opts.name);
  const cmd = opts.cmd ?? ['node', '/app/dist/workers/opencode-harness.mjs'];
  const envArgs = Object.entries(opts.env)
    .map(([k, v]) => `-e ${k}=${JSON.stringify(v)}`)
    .join(' ');
  const workerToolsPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../src/worker-tools',
  );
  let volumeFlag = '';
  if (existsSync(workerToolsPath)) {
    volumeFlag = `-v "${workerToolsPath}:/tools"`;
  } else {
    log.warn({ workerToolsPath }, 'worker-tools path not found — skipping bind mount');
  }
  const dockerCmd = `docker run -d --rm --add-host=host.docker.internal:host-gateway ${volumeFlag} --name ${JSON.stringify(opts.name)} ${envArgs} ai-employee-worker:latest ${cmd.join(' ')}`;
  const containerId = execSync(dockerCmd, { encoding: 'utf8' }).trim();
  const logFile = `/tmp/${opts.name}.log`;
  const logProc = spawn('sh', ['-c', `docker logs -f ${containerId} > ${logFile} 2>&1`], {
    detached: true,
    stdio: 'ignore',
  });
  logProc.unref();
  log.info(
    { taskId: opts.taskId, containerId, name: opts.name },
    'Local Docker container dispatched',
  );
  return { id: 'docker_' + containerId.slice(0, 12) };
}

export function stopLocalDockerContainer(name: string): void {
  try {
    execSync(`docker stop ${JSON.stringify(name)} 2>/dev/null || true`, { encoding: 'utf8' });
    execSync(`docker rm -f ${JSON.stringify(name)} 2>/dev/null || true`, { encoding: 'utf8' });
  } catch {
    /* Container may not exist — safe to ignore */
  }
}
