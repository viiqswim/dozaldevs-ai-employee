import { optionalEnv } from '../lib/require-env.js';

function parseArgs(argv: string[]): { help: boolean } {
  const args = argv.slice(2);
  return { help: args.includes('--help') };
}

async function main(): Promise<void> {
  const { help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx validate-env.ts\n\n' +
        'Validates that Jira authentication environment variables are set.\n\n' +
        'Options:\n' +
        '  --help  Show this help message\n\n' +
        'Output: JSON object with ok (boolean), mode ("oauth"|"basic"|null), and vars\n\n' +
        'Environment variables (one auth mode required):\n' +
        '  OAuth:  JIRA_ACCESS_TOKEN + JIRA_CLOUD_ID\n' +
        '  Basic:  JIRA_API_TOKEN + JIRA_USER_EMAIL + JIRA_BASE_URL\n',
    );
    process.exit(0);
  }

  const oauthVars = ['JIRA_ACCESS_TOKEN', 'JIRA_CLOUD_ID'] as const;
  const basicVars = ['JIRA_API_TOKEN', 'JIRA_USER_EMAIL', 'JIRA_BASE_URL'] as const;

  const oauthSet = oauthVars.filter((v) => optionalEnv(v));
  const basicSet = basicVars.filter((v) => optionalEnv(v));

  const oauthReady = oauthSet.length === oauthVars.length;
  const basicReady = basicSet.length === basicVars.length;

  const vars: Record<string, string> = {};
  for (const v of [...oauthVars, ...basicVars]) {
    vars[v] = optionalEnv(v) ? 'set' : 'missing';
  }

  if (oauthReady) {
    process.stdout.write(JSON.stringify({ ok: true, mode: 'oauth', vars }) + '\n');
  } else if (basicReady) {
    process.stdout.write(JSON.stringify({ ok: true, mode: 'basic', vars }) + '\n');
  } else {
    const missing = [...oauthVars, ...basicVars].filter((v) => !optionalEnv(v));
    process.stdout.write(JSON.stringify({ ok: false, mode: null, missing, vars }) + '\n');
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
