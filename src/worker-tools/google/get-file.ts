import { googleFetch } from './google-fetch.js';
import { getArg } from '../lib/get-arg.js';

type FileOwner = {
  displayName: string;
  emailAddress: string;
  kind: string;
  me: boolean;
};

type FileMetadata = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  modifiedTime?: string;
  owners?: FileOwner[];
  description?: string;
};

function parseArgs(argv: string[]): { fileId: string; help: boolean } {
  const args = argv.slice(2);
  return {
    fileId: getArg(args, '--file-id') ?? '',
    help: args.includes('--help'),
  };
}

async function main(): Promise<void> {
  const { fileId, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx get-file.ts --file-id <string>\n\n' +
        'Gets file metadata from Google Drive.\n\n' +
        'Options:\n' +
        '  --file-id <string>     (required) Google Drive file ID\n' +
        '  --help                 Show this help message\n\n' +
        'Output: JSON { id, name, mimeType, size, webViewLink, modifiedTime, owners, description }\n\n' +
        'Environment variables:\n' +
        '  GOOGLE_ACCESS_TOKEN    (required) OAuth 2.0 access token\n',
    );
    process.exit(0);
  }

  if (!fileId) {
    process.stderr.write('Error: --file-id is required\n');
    process.exit(1);
  }

  const fields = 'id,name,mimeType,size,webViewLink,modifiedTime,owners,description';
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}`;

  const response = await googleFetch(url);

  if (!response.ok) {
    const text = await response.text();
    process.stderr.write(`Error: Drive API returned ${response.status}: ${text}\n`);
    process.exit(1);
  }

  const data = (await response.json()) as FileMetadata;

  process.stdout.write(JSON.stringify(data) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
