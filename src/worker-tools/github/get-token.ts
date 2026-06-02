/**
 * get-token.ts
 *
 * Shell tool for AI employees to obtain a GitHub installation token from the
 * internal gateway endpoint. The token can be used to authenticate git operations
 * and GitHub API calls within the worker container.
 *
 * Auth: Uses TASK_ID env var as the X-Task-ID header — no admin key required.
 * The gateway validates that the task is in Executing state before issuing a token.
 *
 * Output: JSON to stdout + token string written to /tmp/github-token for easy
 * use in subsequent bash commands (e.g. git clone https://x-access-token:$(cat /tmp/github-token)@github.com/...)
 */

import fs from 'fs';

interface Args {
  help: boolean;
}

const TOKEN_FILE = '/tmp/github-token';

function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help') {
      help = true;
    }
  }

  return { help };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.help) {
    process.stdout.write(
      'Usage: tsx get-token.ts\n\n' +
        'Fetches a GitHub installation token from the internal gateway endpoint.\n' +
        'The token is valid for ~1 hour and scoped to the tenant GitHub App installation.\n\n' +
        'No flags required — all configuration comes from environment variables.\n\n' +
        'Environment variables:\n' +
        '  TASK_ID       (required) Current task ID — used as auth credential (X-Task-ID header)\n' +
        '  GATEWAY_URL   (optional) Gateway base URL (default: http://localhost:7700)\n\n' +
        'Output:\n' +
        '  JSON to stdout: { "token": "ghs_...", "expires_at": "2026-..." }\n' +
        '  Token string written to /tmp/github-token for use in shell commands:\n' +
        '    git clone https://x-access-token:$(cat /tmp/github-token)@github.com/org/repo\n\n' +
        'Exit codes:\n' +
        '  0 — success, token written to stdout and /tmp/github-token\n' +
        '  1 — missing env vars, GitHub not connected, task not executing, or API error\n',
    );
    process.exit(0);
  }

  const taskId = process.env['TASK_ID'];
  if (!taskId) {
    process.stderr.write('Error: TASK_ID environment variable is required\n');
    process.exit(1);
  }

  const gatewayUrl = process.env['GATEWAY_URL'] ?? 'http://localhost:7700';
  const endpoint = `${gatewayUrl}/internal/tasks/${encodeURIComponent(taskId)}/github-token`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'X-Task-ID': taskId,
        'Content-Type': 'application/json',
      },
    });
  } catch (err) {
    process.stderr.write(`Error: Failed to connect to gateway at ${gatewayUrl}: ${String(err)}\n`);
    process.exit(1);
  }

  const body = await response.text();

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(body) as { error?: string };
      if (parsed.error) {
        errorMessage = parsed.error;
      }
    } catch {
      // use raw body if not JSON
      if (body.trim()) {
        errorMessage = body.trim();
      }
    }

    if (response.status === 404) {
      process.stderr.write(`Error: ${errorMessage}\n`);
    } else if (response.status === 403) {
      process.stderr.write(`Error: Task is not in Executing state — ${errorMessage}\n`);
    } else if (response.status === 400) {
      process.stderr.write(`Error: Bad request — ${errorMessage}\n`);
    } else {
      process.stderr.write(`Error: Gateway returned ${response.status} — ${errorMessage}\n`);
    }
    process.exit(1);
  }

  let result: { token: string; expires_at: string };
  try {
    result = JSON.parse(body) as { token: string; expires_at: string };
  } catch {
    process.stderr.write(`Error: Gateway returned invalid JSON: ${body}\n`);
    process.exit(1);
  }

  if (!result.token) {
    process.stderr.write('Error: Gateway response missing token field\n');
    process.exit(1);
  }

  // Write token to /tmp/github-token for easy use in shell commands
  try {
    fs.writeFileSync(TOKEN_FILE, result.token, 'utf8');
  } catch (err) {
    process.stderr.write(`Error: Failed to write token to ${TOKEN_FILE}: ${String(err)}\n`);
    process.exit(1);
  }

  process.stdout.write(JSON.stringify(result) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
