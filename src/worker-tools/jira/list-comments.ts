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

type CommentItem = {
  id: string;
  author: string;
  body: string;
  created: string;
};

type CommentsOutput = {
  comments: CommentItem[];
  total: number;
};

function parseArgs(argv: string[]): { issueKey: string; maxResults: number; help: boolean } {
  const args = argv.slice(2);
  let issueKey = '';
  let maxResults = 50;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--issue-key' && args[i + 1]) {
      issueKey = args[++i];
    } else if (args[i] === '--max-results' && args[i + 1]) {
      maxResults = parseInt(args[++i], 10);
    } else if (args[i] === '--help') {
      help = true;
    }
  }

  return { issueKey, maxResults, help };
}

async function main(): Promise<void> {
  const { issueKey, maxResults, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx list-comments.ts --issue-key <KEY> [--max-results <N>]\n\n' +
        'Lists comments on a Jira issue with plain-text bodies.\n\n' +
        'Options:\n' +
        '  --issue-key <KEY>    Issue key (e.g. PROJ-123) [required]\n' +
        '  --max-results <N>    Maximum number of comments to return (default: 50)\n' +
        '  --help               Show this help message\n\n' +
        'Output: JSON object with comments array and total count\n\n' +
        'Environment variables (one auth mode required):\n' +
        '  OAuth:  JIRA_ACCESS_TOKEN + JIRA_CLOUD_ID\n' +
        '  Basic:  JIRA_API_TOKEN + JIRA_USER_EMAIL + JIRA_BASE_URL\n',
    );
    process.exit(0);
  }

  const { resolveJiraAuth } = await import('./auth.js');

  if (process.env['JIRA_MOCK'] === 'true') {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const fixturePath = join(__dirname, 'fixtures', 'list-comments', 'default.json');
    const fixtureData = readFileSync(fixturePath, 'utf8');
    process.stdout.write(fixtureData.trimEnd() + '\n');
    return;
  }

  if (!issueKey) {
    process.stderr.write('Error: --issue-key is required\n');
    process.exit(1);
  }

  const { headers, baseUrl } = resolveJiraAuth();

  const params = new URLSearchParams({ startAt: '0', maxResults: String(maxResults) });
  const url = `${baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment?${params.toString()}`;
  const res = await fetch(url, { headers });

  if (!res.ok) {
    process.stderr.write(
      `Error: Failed to list comments for ${issueKey}: ${res.status} ${res.statusText}\n`,
    );
    process.exit(1);
  }

  const result = (await res.json()) as {
    comments: Array<{
      id: string;
      author: { displayName: string };
      body: unknown;
      created: string;
    }>;
    total: number;
  };

  const output: CommentsOutput = {
    comments: result.comments.map((c) => ({
      id: c.id,
      author: c.author.displayName,
      body: adfToPlainText(c.body),
      created: c.created,
    })),
    total: result.total,
  };

  process.stdout.write(JSON.stringify(output) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
