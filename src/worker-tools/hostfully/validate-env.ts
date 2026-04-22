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
      'Usage: node validate-env.js\nValidates HOSTFULLY_API_KEY and HOSTFULLY_AGENCY_UID are set.\n',
    );
    process.exit(0);
  }

  const apiKey = process.env['HOSTFULLY_API_KEY'];
  if (!apiKey) {
    process.stderr.write('Error: HOSTFULLY_API_KEY environment variable is required\n');
    process.exit(1);
  }

  const agencyUid = process.env['HOSTFULLY_AGENCY_UID'];
  if (!agencyUid) {
    process.stderr.write('Error: HOSTFULLY_AGENCY_UID environment variable is required\n');
    process.exit(1);
  }

  process.stdout.write(JSON.stringify({ ok: true, apiKeySet: true, agencyUidSet: true }) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
