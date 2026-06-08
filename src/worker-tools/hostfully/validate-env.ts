import { requireEnv } from '../lib/require-env.js';

function parseArgs(argv: string[]): { help: boolean } {
  const args = argv.slice(2);
  return {
    help: args.includes('--help'),
  };
}

async function main(): Promise<void> {
  const { help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: node validate-env.js\nValidates HOSTFULLY_API_KEY and HOSTFULLY_AGENCY_UID are set.\n',
    );
    process.exit(0);
  }

  requireEnv('HOSTFULLY_API_KEY');
  requireEnv('HOSTFULLY_AGENCY_UID');

  process.stdout.write(JSON.stringify({ ok: true, apiKeySet: true, agencyUidSet: true }) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
