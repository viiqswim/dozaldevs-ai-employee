/**
 * SHELL TOOL TEMPLATE — copy this file to src/worker-tools/{service}/{verb}-{noun}.ts
 *
 * Replace every occurrence of:
 *   - "example"      → your verb-noun (e.g. "get-property", "send-message")
 *   - "EXAMPLE"      → your service name in SCREAMING_SNAKE (e.g. "HOSTFULLY", "SLACK")
 *   - "ExampleResult" → your output shape
 *
 * Full guide: docs/guides/2026-05-04-1645-adding-a-shell-tool.md
 * Skill:      .opencode/skills/adding-shell-tools/SKILL.md
 *
 * CHECKLIST before shipping:
 *   [ ] --help exits 0 and prints usage
 *   [ ] Mock mode reads fixtures/{verb}-{noun}.json and exits 0
 *   [ ] Missing required arg → stderr + exit 1
 *   [ ] Missing required env var → stderr + exit 1 (via requireEnv)
 *   [ ] All free-text args wrapped with unescapeShellArg
 *   [ ] Output is JSON to stdout (never human-readable prose)
 *   [ ] New service directory added to AGENTS.md shell-tools table
 *   [ ] Usage example added to archetype instructions in prisma/seed.ts
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { getArg } from '../lib/get-arg.js';
import { optionalEnv, requireEnv } from '../lib/require-env.js';
import { unescapeShellArg } from '../lib/unescape-args.js';

// ---------------------------------------------------------------------------
// Output shape — replace with your actual response fields
// ---------------------------------------------------------------------------
interface ExampleResult {
  id: string;
  message: string;
  processedAt: string;
}

// ---------------------------------------------------------------------------
// main() — all logic lives here; top-level only calls main() and catches
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // 1. --help FIRST — before mock mode, before any validation
  if (args.includes('--help')) {
    process.stdout.write(
      'Usage: tsx example-tool.ts --resource-id <id> --message <text> [--optional-flag <value>]\n\n' +
        'Options:\n' +
        '  --resource-id <id>      (required) ID of the resource to act on\n' +
        '  --message <text>        (required) Free-text message (\\n sequences are unescaped)\n' +
        '  --optional-flag <val>   (optional) Extra configuration value\n' +
        '  --help                  Show this help message\n\n' +
        'Environment variables:\n' +
        '  EXAMPLE_API_KEY         (required) API key for the Example service\n' +
        '  EXAMPLE_MOCK            Set to "true" to return fixture data without calling the API\n\n' +
        'Output (JSON to stdout):\n' +
        '  { "id": "...", "message": "...", "processedAt": "..." }\n',
    );
    process.exit(0);
  }

  // 2. Mock mode SECOND — bypasses all validation and API calls
  if (optionalEnv('EXAMPLE_MOCK') === 'true') {
    const fixturePath = new URL('./fixtures/example-tool.json', import.meta.url);
    const fixture = JSON.parse(readFileSync(fileURLToPath(fixturePath), 'utf8')) as ExampleResult;
    process.stdout.write(JSON.stringify(fixture) + '\n');
    process.exit(0);
  }

  // 3. Parse CLI args using the shared helper (no manual for-loops)
  const resourceId = getArg(args, '--resource-id');
  const rawMessage = getArg(args, '--message');
  const optionalFlag = getArg(args, '--optional-flag');

  // 4. Validate required args — write to stderr, exit 1
  if (!resourceId) {
    process.stderr.write('Error: --resource-id is required\n');
    process.exit(1);
  }
  if (!rawMessage) {
    process.stderr.write('Error: --message is required\n');
    process.exit(1);
  }

  // 5. Unescape free-text args — LLMs pass literal \n, not real newlines
  const message = unescapeShellArg(rawMessage);

  // 6. Validate required env vars using requireEnv (throws + exits 1 if missing)
  const apiKey = requireEnv('EXAMPLE_API_KEY');

  // 7. Optional env vars via optionalEnv (returns undefined if missing)
  const baseUrl = optionalEnv('EXAMPLE_API_URL') ?? 'https://api.example.com';

  // 8. Do the work — replace this block with your actual API call
  const response = await fetch(`${baseUrl}/resources/${resourceId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      ...(optionalFlag !== undefined && { flag: optionalFlag }),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    process.stderr.write(`Error: API request failed with status ${response.status}: ${body}\n`);
    process.exit(1);
  }

  const data = (await response.json()) as ExampleResult;

  // 9. Write JSON result to stdout — always a single line ending with \n
  process.stdout.write(JSON.stringify(data) + '\n');
}

// ---------------------------------------------------------------------------
// ESM main-guard — only run when this file is the entry point, not when
// imported as a module (e.g. in tests or by other tools)
// ---------------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`Fatal: ${String(err)}\n`);
    process.exit(1);
  });
}
