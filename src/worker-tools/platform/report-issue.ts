/**
 * report-issue.ts
 *
 * Shell tool for AI employees to report tool issues encountered during task execution.
 *
 * When to use: Call this tool when you patch a broken tool, encounter unexpected
 * behavior that deviates from documented expectations, or work around a tool failure.
 * This creates a durable record in system_events and notifies engineers via Slack.
 *
 * What constitutes a reportable event:
 * - A tool returned an unexpected error (5xx, malformed JSON, timeout)
 * - You modified a .ts file in /tools/ to work around a bug
 * - A tool behaved differently from its --help documentation
 *
 * See AGENTS.md Section 4 for the mandatory reporting policy.
 */

interface Args {
  taskId: string;
  toolName: string;
  description: string;
  patchDiff: string | null;
  help: boolean;
}

interface PostgRestRecord {
  id: string;
  [key: string]: unknown;
}

function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  let taskId = '';
  let toolName = '';
  let description = '';
  let patchDiff: string | null = null;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--task-id' && args[i + 1]) {
      taskId = args[++i];
    } else if (args[i] === '--tool-name' && args[i + 1]) {
      toolName = args[++i];
    } else if (args[i] === '--description' && args[i + 1]) {
      description = args[++i];
    } else if (args[i] === '--patch-diff' && args[i + 1]) {
      patchDiff = args[++i];
    } else if (args[i] === '--help') {
      help = true;
    }
  }

  return { taskId, toolName, description, patchDiff, help };
}

function formatSlackMessage(
  taskId: string,
  toolName: string,
  description: string,
  patchApplied: boolean,
): string {
  const lines = [
    `🔧 *Tool Issue Reported*`,
    `*Task ID:* \`${taskId}\``,
    `*Tool:* \`${toolName}\``,
    `*Description:* ${description}`,
  ];
  if (patchApplied) {
    lines.push(`*Patch:* A patch diff was applied — check system_events for full details.`);
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.help) {
    process.stdout.write(
      'Usage: tsx report-issue.ts --task-id <id> --tool-name <name> --description <text> [--patch-diff <diff>]\n\n' +
        'Reports a tool issue to system_events (PostgREST) and sends a Slack alert.\n\n' +
        'Options:\n' +
        '  --task-id <id>         (required) Current task ID\n' +
        '  --tool-name <name>     (required) Name of the tool that had the issue\n' +
        '  --description <text>   (required) Description of what went wrong\n' +
        '  --patch-diff <diff>    (optional) The patch applied to work around the issue\n' +
        '  --help                 Show this help message\n\n' +
        'Environment variables:\n' +
        '  SUPABASE_URL           (required) Base URL for PostgREST (e.g. http://localhost:54331)\n' +
        '  SUPABASE_SECRET_KEY    (required) Service role JWT for PostgREST auth\n' +
        '  TENANT_ID              (required) Tenant UUID for the system_events record\n' +
        '  SLACK_BOT_TOKEN        (required) Slack bot token for posting alerts\n' +
        '  ISSUES_SLACK_CHANNEL   (optional) Slack channel ID to post alert; skip if not set\n' +
        '  SLACK_API_BASE_URL     (optional) Slack API base URL (default: https://slack.com/api)\n\n' +
        'Output (stdout on success):\n' +
        '  { "ok": true, "event_id": "<uuid>" }\n\n' +
        'Exit codes:\n' +
        '  0 — DB write succeeded (Slack failure is non-fatal, logged to stderr)\n' +
        '  1 — DB write failed, missing required arg, or missing required env var\n',
    );
    process.exit(0);
  }

  if (!args.taskId) {
    process.stderr.write('Error: --task-id is required\n');
    process.exit(1);
  }
  if (!args.toolName) {
    process.stderr.write('Error: --tool-name is required\n');
    process.exit(1);
  }
  if (!args.description) {
    process.stderr.write('Error: --description is required\n');
    process.exit(1);
  }

  const supabaseUrl = process.env['SUPABASE_URL'];
  if (!supabaseUrl) {
    process.stderr.write('Error: SUPABASE_URL environment variable is required\n');
    process.exit(1);
  }

  const supabaseKey = process.env['SUPABASE_SECRET_KEY'];
  if (!supabaseKey) {
    process.stderr.write('Error: SUPABASE_SECRET_KEY environment variable is required\n');
    process.exit(1);
  }

  const tenantId = process.env['TENANT_ID'];
  if (!tenantId) {
    process.stderr.write('Error: TENANT_ID environment variable is required\n');
    process.exit(1);
  }

  const slackBotToken = process.env['SLACK_BOT_TOKEN'];
  if (!slackBotToken) {
    process.stderr.write('Error: SLACK_BOT_TOKEN environment variable is required\n');
    process.exit(1);
  }

  const issuesSlackChannel = process.env['ISSUES_SLACK_CHANNEL'];
  const slackApiBase = process.env['SLACK_API_BASE_URL'] ?? 'https://slack.com/api';

  const postgrestUrl = `${supabaseUrl}/rest/v1/system_events`;
  const postgrestHeaders = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  const body: Record<string, unknown> = {
    tenant_id: tenantId,
    task_id: args.taskId,
    tool_name: args.toolName,
    issue_description: args.description,
    patch_applied: args.patchDiff !== null,
  };
  if (args.patchDiff !== null) {
    body['patch_diff'] = args.patchDiff;
  }

  const dbRes = await fetch(postgrestUrl, {
    method: 'POST',
    headers: postgrestHeaders,
    body: JSON.stringify(body),
  });

  if (!dbRes.ok) {
    process.stderr.write(`Error: Failed to write system event: ${dbRes.status}\n`);
    process.exit(1);
  }

  const dbData = (await dbRes.json()) as PostgRestRecord[];
  const eventId = dbData[0]?.id ?? '';

  if (!issuesSlackChannel) {
    process.stderr.write('Warning: ISSUES_SLACK_CHANNEL not set — skipping Slack notification\n');
  } else {
    const slackUrl = `${slackApiBase}/chat.postMessage`;
    const slackText = formatSlackMessage(
      args.taskId,
      args.toolName,
      args.description,
      args.patchDiff !== null,
    );

    try {
      const slackRes = await fetch(slackUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${slackBotToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channel: issuesSlackChannel, text: slackText }),
      });

      const slackJson = (await slackRes.json()) as { ok: boolean; error?: string };
      if (!slackJson.ok) {
        process.stderr.write(
          `Warning: Slack notification failed: ${slackJson.error ?? 'unknown error'}\n`,
        );
      }
    } catch (err) {
      process.stderr.write(`Warning: Slack notification failed: ${String(err)}\n`);
    }
  }

  process.stdout.write(JSON.stringify({ ok: true, event_id: eventId }) + '\n');
}

main().catch((err) => {
  process.stderr.write('Fatal: ' + String(err) + '\n');
  process.exit(1);
});
