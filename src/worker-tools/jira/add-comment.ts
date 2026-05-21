function adfToPlainText(adf: unknown): string {
  if (!adf || typeof adf !== 'object') return '';
  const texts: string[] = [];

  function extractText(nodes: unknown): void {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (node && typeof node === 'object') {
        const n = node as Record<string, unknown>;
        if (typeof n['text'] === 'string') texts.push(n['text']);
        extractText(n['content']);
      }
    }
  }

  extractText((adf as Record<string, unknown>)['content']);
  return texts.join('');
}

type CommentOutput = {
  id: string;
  body: string;
  created: string;
};

function parseArgs(argv: string[]): { issueKey: string; body: string; help: boolean } {
  const args = argv.slice(2);
  let issueKey = '';
  let body = '';
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--issue-key' && args[i + 1]) {
      issueKey = args[++i];
    } else if (args[i] === '--body' && args[i + 1]) {
      body = args[++i];
    } else if (args[i] === '--help') {
      help = true;
    }
  }

  return { issueKey, body, help };
}

async function main(): Promise<void> {
  const { issueKey, body, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx add-comment.ts --issue-key <KEY> --body "comment text"\n\n' +
        'Adds a plain-text comment to a Jira issue.\n\n' +
        '⚠️  Irreversible: Comments cannot be deleted via this tool.\n\n' +
        'Options:\n' +
        '  --issue-key <KEY>  Issue key (e.g. PROJ-123) [required]\n' +
        '  --body <text>      Comment text to add [required]\n' +
        '  --help             Show this help message\n\n' +
        'Output: JSON object with id, body (plain text), and created timestamp\n\n' +
        'Environment variables:\n' +
        '  JIRA_API_TOKEN    (required) Jira API token\n' +
        '  JIRA_USER_EMAIL   (required) Jira user email\n' +
        '  JIRA_BASE_URL     (required) Jira base URL (e.g. https://your-org.atlassian.net)\n',
    );
    process.exit(0);
  }

  if (process.env['JIRA_MOCK'] === 'true') {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const fixturePath = join(__dirname, 'fixtures', 'add-comment', 'default.json');
    const fixtureData = readFileSync(fixturePath, 'utf8');
    process.stdout.write(fixtureData.trimEnd() + '\n');
    return;
  }

  if (!issueKey) {
    process.stderr.write('Error: --issue-key is required\n');
    process.exit(1);
  }

  if (!body) {
    process.stderr.write('Error: --body is required\n');
    process.exit(1);
  }

  const apiToken = process.env['JIRA_API_TOKEN'];
  if (!apiToken) {
    process.stderr.write('Error: JIRA_API_TOKEN environment variable is required\n');
    process.exit(1);
  }

  const email = process.env['JIRA_USER_EMAIL'];
  if (!email) {
    process.stderr.write('Error: JIRA_USER_EMAIL environment variable is required\n');
    process.exit(1);
  }

  const baseUrl = process.env['JIRA_BASE_URL'];
  if (!baseUrl) {
    process.stderr.write('Error: JIRA_BASE_URL environment variable is required\n');
    process.exit(1);
  }

  const adfBody = {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: body }],
      },
    ],
  };

  const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
  const headers = {
    Authorization: `Basic ${auth}`,
    'Content-Type': 'application/json',
  };

  const url = `${baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ body: adfBody }),
  });

  if (!res.ok) {
    process.stderr.write(
      `Error: Failed to add comment to ${issueKey}: ${res.status} ${res.statusText}\n`,
    );
    process.exit(1);
  }

  const created = (await res.json()) as {
    id: string;
    body: unknown;
    created: string;
  };

  const output: CommentOutput = {
    id: created.id,
    body: adfToPlainText(created.body),
    created: created.created,
  };

  process.stdout.write(JSON.stringify(output) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
