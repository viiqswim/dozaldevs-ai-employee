import { getArg } from '../lib/get-arg.js';
import { optionalEnv } from '../lib/require-env.js';

type IssueSearchItem = {
  key: string;
  summary: string;
  status: string;
  priority: string;
  assignee: string | null;
};

type SearchOutput = {
  issues: IssueSearchItem[];
  total: number;
  maxResults: number;
};

function parseArgs(argv: string[]): {
  project: string;
  status: string;
  assignee: string;
  jql: string;
  maxResults: number;
  help: boolean;
} {
  const args = argv.slice(2);
  const maxResultsRaw = getArg(args, '--max-results');
  return {
    project: getArg(args, '--project') ?? '',
    status: getArg(args, '--status') ?? '',
    assignee: getArg(args, '--assignee') ?? '',
    jql: getArg(args, '--jql') ?? '',
    maxResults: maxResultsRaw ? parseInt(maxResultsRaw, 10) : 50,
    help: args.includes('--help'),
  };
}

async function main(): Promise<void> {
  const { project, status, assignee, jql: rawJql, maxResults, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx search-issues.ts --project <KEY> [--status <status>] [--assignee <accountId>] [--jql <raw-jql>] [--max-results <N>]\n\n' +
        'Searches Jira issues using JQL and returns matching issues.\n\n' +
        'Options:\n' +
        '  --project <KEY>         Project key to search in (required unless --jql provided)\n' +
        '  --status <status>       Filter by status name (optional)\n' +
        '  --assignee <accountId>  Filter by assignee account ID (optional)\n' +
        '  --jql <raw-jql>         Raw JQL query (overrides --project/--status/--assignee)\n' +
        '  --max-results <N>       Maximum number of results (default: 50)\n' +
        '  --help                  Show this help message\n\n' +
        'Output: JSON object with issues array, total, and maxResults\n\n' +
        'Environment variables (one auth mode required):\n' +
        '  OAuth:  JIRA_ACCESS_TOKEN + JIRA_CLOUD_ID\n' +
        '  Basic:  JIRA_API_TOKEN + JIRA_USER_EMAIL + JIRA_BASE_URL\n',
    );
    process.exit(0);
  }

  const { resolveJiraAuth } = await import('./auth.js');

  if (optionalEnv('JIRA_MOCK') === 'true') {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const fixturePath = join(__dirname, 'fixtures', 'search-issues', 'default.json');
    const fixtureData = readFileSync(fixturePath, 'utf8');
    process.stdout.write(fixtureData.trimEnd() + '\n');
    return;
  }

  if (!rawJql && !project) {
    process.stderr.write('Error: --project is required (unless --jql is provided)\n');
    process.exit(1);
  }

  const { headers, baseUrl } = resolveJiraAuth();

  let jql: string;
  if (rawJql) {
    jql = rawJql;
  } else {
    const conditions: string[] = [`project = "${project}"`];
    if (status) conditions.push(`status = "${status}"`);
    if (assignee) conditions.push(`assignee = "${assignee}"`);
    jql = conditions.join(' AND ') + ' ORDER BY created DESC';
  }

  const url = `${baseUrl}/rest/api/3/search/jql`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jql,
      fields: ['summary', 'status', 'priority', 'assignee'],
      startAt: 0,
      maxResults,
    }),
  });

  if (!res.ok) {
    process.stderr.write(`Error: Failed to search issues: ${res.status} ${res.statusText}\n`);
    process.exit(1);
  }

  const result = (await res.json()) as {
    issues: Array<{
      key: string;
      fields: {
        summary: string;
        status: { name: string };
        priority: { name: string };
        assignee: { displayName: string } | null;
      };
    }>;
    total: number;
    maxResults: number;
  };

  const output: SearchOutput = {
    issues: result.issues.map((issue) => ({
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status.name,
      priority: issue.fields.priority.name,
      assignee: issue.fields.assignee?.displayName ?? null,
    })),
    total: result.total,
    maxResults: result.maxResults,
  };

  process.stdout.write(JSON.stringify(output) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
