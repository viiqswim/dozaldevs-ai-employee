function parseArgs(argv: string[]): { help: boolean } {
  const args = argv.slice(2);
  let help = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help') help = true;
  }
  return { help };
}

async function main(): Promise<void> {
  const { help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: node validate-env.js\n' +
        'Validates GOOGLE_ACCESS_TOKEN is set.\n' +
        'Exits 0 with JSON { ok: true } if valid.\n' +
        'Exits 1 with error message if missing.\n',
    );
    process.exit(0);
  }

  const accessToken = process.env['GOOGLE_ACCESS_TOKEN'];
  if (!accessToken) {
    process.stderr.write('Error: GOOGLE_ACCESS_TOKEN environment variable is required\n');
    process.stderr.write(
      'Hint: Get a token via the internal token endpoint: POST /internal/tasks/{taskId}/google-token\n',
    );
    process.exit(1);
  }

  process.stdout.write(JSON.stringify({ ok: true, accessTokenSet: true }) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
