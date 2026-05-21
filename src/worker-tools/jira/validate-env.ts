function parseArgs(argv: string[]): { help: boolean } {
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
  const { help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx validate-env.ts\n\n' +
        'Validates that required Jira environment variables are set.\n\n' +
        'Options:\n' +
        '  --help  Show this help message\n\n' +
        'Output: JSON object with ok (boolean), vars (map of var name to "set"/"missing"),\n' +
        '        and missing (array of missing var names when ok is false)\n\n' +
        'Environment variables checked:\n' +
        '  JIRA_API_TOKEN    Jira API token\n' +
        '  JIRA_USER_EMAIL   Jira user email address\n' +
        '  JIRA_BASE_URL     Jira base URL (e.g. https://your-org.atlassian.net)\n',
    );
    process.exit(0);
  }

  const required = ['JIRA_API_TOKEN', 'JIRA_USER_EMAIL', 'JIRA_BASE_URL'] as const;
  const missing: string[] = [];
  const vars: Record<string, string> = {};

  for (const varName of required) {
    if (process.env[varName]) {
      vars[varName] = 'set';
    } else {
      vars[varName] = 'missing';
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    process.stdout.write(JSON.stringify({ ok: false, missing }) + '\n');
  } else {
    process.stdout.write(JSON.stringify({ ok: true, vars }) + '\n');
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
