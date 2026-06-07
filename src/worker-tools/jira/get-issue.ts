import { getArg } from '../lib/get-arg.js';

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

type IssueOutput = {
  id: string;
  key: string;
  summary: string;
  description: string;
  status: string;
  priority: string;
  assignee: string | null;
  reporter: string;
  labels: string[];
  created: string;
  updated: string;
  project: { key: string; name: string };
};

function parseArgs(argv: string[]): { issueKey: string; help: boolean } {
  const args = argv.slice(2);
  return {
    issueKey: getArg(args, '--issue-key') ?? '',
    help: args.includes('--help'),
  };
}

async function main(): Promise<void> {
  const { issueKey, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx get-issue.ts --issue-key <KEY>\n\n' +
        'Fetches a Jira issue by key and returns its details.\n\n' +
        'Options:\n' +
        '  --issue-key <KEY>  Issue key (e.g. PROJ-123) [required]\n' +
        '  --help             Show this help message\n\n' +
        'Output: JSON object with id, key, summary, description (plain text), status,\n' +
        '        priority, assignee, reporter, labels, created, updated, project\n\n' +
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
    const fixturePath = join(__dirname, 'fixtures', 'get-issue', 'default.json');
    const fixtureData = readFileSync(fixturePath, 'utf8');
    process.stdout.write(fixtureData.trimEnd() + '\n');
    return;
  }

  if (!issueKey) {
    process.stderr.write('Error: --issue-key is required\n');
    process.exit(1);
  }

  const { headers, baseUrl } = resolveJiraAuth();

  const url = `${baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}`;
  const res = await fetch(url, { headers });

  if (!res.ok) {
    process.stderr.write(
      `Error: Failed to fetch issue ${issueKey}: ${res.status} ${res.statusText}\n`,
    );
    process.exit(1);
  }

  const issue = (await res.json()) as {
    id: string;
    key: string;
    fields: {
      summary: string;
      description: unknown;
      status: { name: string };
      priority: { name: string };
      assignee: { displayName: string } | null;
      reporter: { displayName: string };
      labels: string[];
      created: string;
      updated: string;
      project: { key: string; name: string };
    };
  };

  const output: IssueOutput = {
    id: issue.id,
    key: issue.key,
    summary: issue.fields.summary,
    description: adfToPlainText(issue.fields.description),
    status: issue.fields.status.name,
    priority: issue.fields.priority.name,
    assignee: issue.fields.assignee?.displayName ?? null,
    reporter: issue.fields.reporter.displayName,
    labels: issue.fields.labels,
    created: issue.fields.created,
    updated: issue.fields.updated,
    project: issue.fields.project,
  };

  process.stdout.write(JSON.stringify(output) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
