/**
 * Composio List Actions shell tool — given a toolkit slug, queries the Composio
 * Tools REST API and prints the toolkit's available actions as a JSON array. This
 * is the runtime discovery fallback an employee uses when no pre-shipped skill
 * documents a toolkit. Raw HTTP only; the @composio/core SDK is not used here.
 * Read-only and tenant-agnostic: no DB/PostgREST access, no user_id namespace.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { getArg } from '../lib/get-arg.js';
import { requireEnv } from '../lib/require-env.js';
import { unescapeShellArg } from '../lib/unescape-args.js';
import type { ToolDescriptor } from '../lib/types.js';

export const descriptor: ToolDescriptor = {
  id: 'list-actions',
  service: 'composio',
  description: "List a Composio toolkit's available actions for runtime discovery",
  envVars: ['COMPOSIO_API_KEY'],
  args: [
    {
      name: '--toolkit',
      required: true,
      description: 'Composio toolkit slug (e.g. "notion", "linear")',
      type: 'string',
    },
    {
      name: '--mock',
      required: false,
      description: 'Return fixture JSON without making an HTTP call',
      type: 'boolean',
    },
  ],
};

const COMPOSIO_TOOLS_BASE_URL = 'https://backend.composio.tech/api/v3.1/tools';

interface ComposioTool {
  slug?: string;
  name?: string;
  description?: string;
  input_parameters?: Record<string, unknown>;
}

interface ComposioToolsResponse {
  items?: ComposioTool[];
}

interface ComposioErrorBody {
  error?: { message?: string; code?: number; slug?: string; status?: number };
}

interface ActionSummary {
  slug: string;
  name: string;
  description: string;
  input_parameters: Record<string, unknown>;
}

function toActionSummaries(body: ComposioToolsResponse): ActionSummary[] {
  const items = Array.isArray(body.items) ? body.items : [];
  return items.map((tool) => ({
    slug: tool.slug ?? '',
    name: tool.name ?? '',
    description: tool.description ?? '',
    input_parameters: tool.input_parameters ?? {},
  }));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    process.stdout.write(
      'Usage: tsx list-actions.ts --toolkit <name> [--mock]\n\n' +
        "Lists a Composio toolkit's available actions via the Composio Tools REST API.\n" +
        'Use this to discover what an integration can do when no pre-shipped skill exists.\n\n' +
        'Options:\n' +
        '  --toolkit <name>   (required) Composio toolkit slug (e.g. "notion", "linear")\n' +
        '  --mock             Return fixture JSON without making an HTTP call\n' +
        '  --help             Show this help message\n\n' +
        'Environment variables:\n' +
        '  COMPOSIO_API_KEY   (required) Composio API key — sent as the x-api-key header\n\n' +
        'Output (JSON to stdout):\n' +
        '  A JSON array of { slug, name, description, input_parameters } on success.\n' +
        '  { "error": "...", "status": N } to stderr on HTTP error (non-zero exit).\n',
    );
    process.exit(0);
  }

  const toolkitRaw = getArg(args, '--toolkit');
  const toolkit = toolkitRaw ? unescapeShellArg(toolkitRaw) : undefined;
  const isMock = args.includes('--mock');

  // --toolkit is mandatory in every mode (including --mock) — fail closed before
  // the mock short-circuit so a missing arg is always a hard error.
  if (!toolkit) {
    process.stderr.write('Error: --toolkit is required\n');
    process.exit(1);
  }

  // Mock mode — short-circuits before requireEnv so it runs without creds.
  if (isMock) {
    const fixturePath = new URL('./__fixtures__/list-actions.json', import.meta.url);
    const fixture = JSON.parse(
      readFileSync(fileURLToPath(fixturePath), 'utf8'),
    ) as ComposioToolsResponse;
    console.log(JSON.stringify(toActionSummaries(fixture)));
    process.exit(0);
  }

  const apiKey = requireEnv('COMPOSIO_API_KEY');

  const url = `${COMPOSIO_TOOLS_BASE_URL}?toolkit_slug=${encodeURIComponent(toolkit)}&limit=1000`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
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

  console.log(JSON.stringify(toActionSummaries((body ?? {}) as ComposioToolsResponse)));
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
