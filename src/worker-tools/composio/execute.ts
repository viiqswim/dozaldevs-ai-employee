/**
 * Composio Execute shell tool — wraps the Composio Execute REST API so AI
 * employees can call any connected Composio toolkit. Raw HTTP only; the
 * @composio/core SDK is not used here. Tenant isolation: the per-tenant
 * namespace is `tenant_${tenantId}`, passed as `user_id` — a user_id without a
 * connection for the toolkit gets a hard HTTP 400 (no cross-tenant leakage).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { getArg } from '../lib/get-arg.js';
import { requireEnv } from '../lib/require-env.js';
import { unescapeShellArg } from '../lib/unescape-args.js';

// Permanent security denylist — source control, payments/finance, and cloud
// infra toolkits an AI employee must never be able to call.
const COMPOSIO_DENIED_TOOLKITS = [
  'github',
  'stripe',
  'paypal',
  'plaid',
  'fly',
  'render',
  'aws',
  'gcp',
  'azure',
];

const COMPOSIO_EXECUTE_BASE_URL = 'https://backend.composio.dev/api/v3.1/tools/execute';

interface ComposioErrorBody {
  error?: { message?: string; code?: number; slug?: string; status?: number };
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

  // Denylist is checked before mock mode and before credentials are read so a
  // denied toolkit can never execute, not even with --mock.
  if (toolkit && COMPOSIO_DENIED_TOOLKITS.includes(toolkit.toLowerCase())) {
    console.error(
      JSON.stringify({ error: `Toolkit '${toolkit}' is not permitted`, code: 'TOOLKIT_DENIED' }),
    );
    process.exit(1);
  }

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

  console.log(JSON.stringify(body));
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
