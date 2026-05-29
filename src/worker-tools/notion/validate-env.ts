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
        'Validates that Notion authentication environment variables are set.\n\n' +
        'Options:\n' +
        '  --help  Show this help message\n\n' +
        'Output: JSON object with ok (boolean), mode ("oauth"|"api_key"|"none"), and vars\n\n' +
        'Environment variables (one auth mode required):\n' +
        '  OAuth:   NOTION_ACCESS_TOKEN\n' +
        '  API Key: NOTION_API_KEY\n',
    );
    process.exit(0);
  }

  const accessToken = process.env['NOTION_ACCESS_TOKEN'];
  const apiKey = process.env['NOTION_API_KEY'];

  const vars = {
    NOTION_ACCESS_TOKEN: Boolean(accessToken),
    NOTION_API_KEY: Boolean(apiKey),
  };

  if (accessToken) {
    process.stdout.write(JSON.stringify({ ok: true, mode: 'oauth', vars }) + '\n');
  } else if (apiKey) {
    process.stdout.write(JSON.stringify({ ok: true, mode: 'api_key', vars }) + '\n');
  } else {
    process.stdout.write(JSON.stringify({ ok: false, mode: 'none', vars }) + '\n');
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
