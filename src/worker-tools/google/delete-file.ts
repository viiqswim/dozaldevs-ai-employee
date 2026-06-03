import { googleFetch } from './google-fetch.js';

function parseArgs(argv: string[]): {
  fileId: string;
  permanent: boolean;
  help: boolean;
} {
  const args = argv.slice(2);
  let fileId = '';
  let permanent = false;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file-id' && args[i + 1]) {
      fileId = args[++i];
    } else if (args[i] === '--permanent') {
      permanent = true;
    } else if (args[i] === '--help') {
      help = true;
    }
  }

  return { fileId, permanent, help };
}

async function main(): Promise<void> {
  const { fileId, permanent, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx delete-file.ts --file-id <string> [--permanent]\n\n' +
        'Trashes or permanently deletes a file in Google Drive.\n\n' +
        'Options:\n' +
        '  --file-id <string>     (required) Google Drive file ID to delete or trash\n' +
        '  --permanent            Permanently delete the file (default: move to trash)\n' +
        '  --help                 Show this help message\n\n' +
        'Output: JSON { deleted: true, fileId, permanent }\n\n' +
        'Environment variables:\n' +
        '  GOOGLE_ACCESS_TOKEN    (required) OAuth 2.0 access token\n',
    );
    process.exit(0);
  }

  if (!fileId) {
    process.stderr.write('Error: --file-id is required\n');
    process.exit(1);
  }

  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`;

  if (permanent) {
    const response = await googleFetch(url, { method: 'DELETE' });
    if (!response.ok) {
      const text = await response.text();
      process.stderr.write(`Error: Drive API returned ${response.status}: ${text}\n`);
      process.exit(1);
    }
  } else {
    const response = await googleFetch(url, {
      method: 'PATCH',
      body: JSON.stringify({ trashed: true }),
    });
    if (!response.ok) {
      const text = await response.text();
      process.stderr.write(`Error: Drive API returned ${response.status}: ${text}\n`);
      process.exit(1);
    }
  }

  process.stdout.write(JSON.stringify({ deleted: true, fileId, permanent }) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
