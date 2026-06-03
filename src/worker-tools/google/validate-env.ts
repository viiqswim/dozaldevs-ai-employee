function parseArgs(argv: string[]): { help: boolean } {
  const args = argv.slice(2);
  let help = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help') help = true;
  }
  return { help };
}

async function fetchFreshToken(taskId: string): Promise<string | null> {
  const gatewayUrl = process.env['GATEWAY_URL'] ?? 'http://localhost:7700';
  const endpoint = `${gatewayUrl}/internal/tasks/${encodeURIComponent(taskId)}/google-token`;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'X-Task-ID': taskId, 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { token?: string };
    return body.token ?? null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const { help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx validate-env.ts\n' +
        'Validates Google access token. Refreshes automatically when TASK_ID is set.\n' +
        'Exits 0 with JSON { ok: true } on success.\n' +
        'Exits 1 with error message on failure.\n',
    );
    process.exit(0);
  }

  const taskId = process.env['TASK_ID'];

  if (taskId) {
    const freshToken = await fetchFreshToken(taskId);
    if (freshToken) {
      process.env['GOOGLE_ACCESS_TOKEN'] = freshToken;
      process.stdout.write(JSON.stringify({ ok: true, tokenRefreshed: true }) + '\n');
      return;
    }
  }

  const accessToken = process.env['GOOGLE_ACCESS_TOKEN'];
  if (!accessToken) {
    process.stderr.write('Error: GOOGLE_ACCESS_TOKEN environment variable is required\n');
    process.exit(1);
  }

  process.stdout.write(JSON.stringify({ ok: true, accessTokenSet: true }) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
