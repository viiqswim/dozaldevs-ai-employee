/**
 * Composio Execute shell tool — wraps the Composio Execute REST API so AI
 * employees can call any connected Composio toolkit. Raw HTTP only; the
 * @composio/core SDK is not used here. Tenant isolation: the per-tenant
 * namespace is `tenant_${tenantId}`, passed as `user_id` — a user_id without a
 * connection for the toolkit gets a hard HTTP 400 (no cross-tenant leakage).
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { getArg } from '../lib/get-arg.js';
import { optionalEnv, requireEnv } from '../lib/require-env.js';
import { unescapeShellArg } from '../lib/unescape-args.js';

const COMPOSIO_EXECUTE_BASE_URL = 'https://backend.composio.dev/api/v3.1/tools/execute';

interface ComposioErrorBody {
  error?: { message?: string; code?: number; slug?: string; status?: number };
}

// Fire-and-forget: a failure here must never change the tool's exit code or stdout.
async function writeAuditRow(toolkit: string, action: string): Promise<void> {
  const supabaseUrl = optionalEnv('SUPABASE_URL');
  const supabaseKey = optionalEnv('SUPABASE_SECRET_KEY');
  const taskId = optionalEnv('TASK_ID');
  const tenantId = optionalEnv('TASK_TENANT_ID');
  const phase = optionalEnv('TASK_PHASE') ?? null;

  if (!supabaseUrl || !supabaseKey || !taskId || !tenantId) {
    process.stderr.write(
      'Warning: skipping task_composio_calls audit write — missing SUPABASE_URL, SUPABASE_SECRET_KEY, TASK_ID, or TASK_TENANT_ID\n',
    );
    return;
  }

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/task_composio_calls`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        id: randomUUID(),
        task_id: taskId,
        tenant_id: tenantId,
        toolkit,
        tool_name: action,
        phase,
        called_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      process.stderr.write(
        `Warning: task_composio_calls audit write returned status ${res.status}: ${errText}\n`,
      );
    }
  } catch (err) {
    process.stderr.write(`Warning: task_composio_calls audit write failed: ${String(err)}\n`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    process.stdout.write(
      'Usage: tsx execute.ts --toolkit <name> --action <slug> [--params <json>] [--tenant-id <id>] [--mock]\n\n' +
        'Wraps the Composio Execute REST API to call any connected Composio toolkit.\n\n' +
        'Options:\n' +
        '  --toolkit <name>   (required) Composio toolkit name (e.g. "notion", "linear")\n' +
        '  --action <slug>    (required) Action/tool slug (e.g. "NOTION_GET_PAGE_MARKDOWN")\n' +
        '  --params <json>    Optional JSON string of action input params (default: {})\n' +
        '  --tenant-id <id>   Tenant ID (defaults to the TASK_TENANT_ID env var)\n' +
        '  --mock             Return fixture JSON without making an HTTP call\n' +
        '  --help             Show this help message\n\n' +
        'Environment variables:\n' +
        '  COMPOSIO_API_KEY   (required) Composio API key — sent as the x-api-key header\n' +
        '  TASK_TENANT_ID     (required unless --tenant-id is given) Tenant namespace\n\n' +
        'Output (JSON to stdout):\n' +
        '  The raw Composio Execute response body on success.\n' +
        '  { "error": "...", "status": N } to stderr on HTTP error (non-zero exit).\n',
    );
    process.exit(0);
  }

  const toolkit = getArg(args, '--toolkit');
  const action = getArg(args, '--action');
  const rawParams = getArg(args, '--params');
  const tenantIdArg = getArg(args, '--tenant-id');
  const isMock = args.includes('--mock');

  // 3. Mock mode — short-circuits before requireEnv so it runs without creds.
  if (isMock) {
    const fixturePath = new URL('./__fixtures__/execute.json', import.meta.url);
    const fixture = JSON.parse(readFileSync(fileURLToPath(fixturePath), 'utf8')) as unknown;
    console.log(JSON.stringify(fixture));
    process.exit(0);
  }

  if (!toolkit) {
    process.stderr.write('Error: --toolkit is required\n');
    process.exit(1);
  }
  if (!action) {
    process.stderr.write('Error: --action is required\n');
    process.exit(1);
  }

  // unescapeShellArg converts LLM-emitted literal \n/\t/\r so free-text values
  // inside the JSON survive the shell hop before JSON.parse.
  let parsedParams: unknown = {};
  if (rawParams) {
    try {
      parsedParams = JSON.parse(unescapeShellArg(rawParams));
    } catch (_err) {
      console.error(
        JSON.stringify({ error: '--params is not valid JSON', code: 'INVALID_PARAMS' }),
      );
      process.exit(1);
    }
  }

  const apiKey = requireEnv('COMPOSIO_API_KEY');
  const tenantId = tenantIdArg ?? requireEnv('TASK_TENANT_ID');

  let response: Response;
  try {
    response = await fetch(`${COMPOSIO_EXECUTE_BASE_URL}/${action}`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_id: `tenant_${tenantId}`, arguments: parsedParams }),
    });
  } catch (err) {
    console.error(
      JSON.stringify({ error: `Failed to connect to Composio: ${String(err)}`, status: 0 }),
    );
    process.exit(1);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (_err) {
    body = undefined;
  }

  if (!response.ok) {
    const errBody = body as ComposioErrorBody | undefined;
    console.error(
      JSON.stringify({
        error: errBody?.error?.message ?? 'HTTP error',
        status: response.status,
      }),
    );
    process.exit(1);
  }

  await writeAuditRow(toolkit, action);

  console.log(JSON.stringify(body));
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
