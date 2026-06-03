import { requireEnv } from './google-fetch.js';
import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';

type UploadResponse = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
};

const MIME_TYPE_MAP: Record<string, string> = {
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function detectMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPE_MAP[ext] ?? 'application/octet-stream';
}

function parseArgs(argv: string[]): {
  filePath: string;
  name: string;
  folderId: string;
  help: boolean;
} {
  const args = argv.slice(2);
  let filePath = '';
  let name = '';
  let folderId = '';
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file-path' && args[i + 1]) {
      filePath = args[++i];
    } else if (args[i] === '--name' && args[i + 1]) {
      name = args[++i];
    } else if (args[i] === '--folder-id' && args[i + 1]) {
      folderId = args[++i];
    } else if (args[i] === '--help') {
      help = true;
    }
  }

  return { filePath, name, folderId, help };
}

async function main(): Promise<void> {
  const { filePath, name, folderId, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx upload-file.ts --file-path <path> [--name <string>] [--folder-id <string>]\n\n' +
        'Uploads a file to Google Drive using multipart upload.\n\n' +
        'Options:\n' +
        '  --file-path <path>     (required) Local path to the file to upload\n' +
        '  --name <string>        (optional) Name for the file in Drive (default: basename of --file-path)\n' +
        '  --folder-id <string>   (optional) Parent folder ID in Drive\n' +
        '  --help                 Show this help message\n\n' +
        'Output: JSON { id, name, mimeType, webViewLink }\n\n' +
        'Environment variables:\n' +
        '  GOOGLE_ACCESS_TOKEN    (required) OAuth 2.0 access token\n',
    );
    process.exit(0);
  }

  if (!filePath) {
    process.stderr.write('Error: --file-path is required\n');
    process.exit(1);
  }

  const accessToken = requireEnv('GOOGLE_ACCESS_TOKEN');

  const fileName = name || basename(filePath);
  const fileMimeType = detectMimeType(filePath);

  let fileContent: Buffer;
  try {
    fileContent = readFileSync(filePath);
  } catch (readErr) {
    process.stderr.write(`Error: Failed to read file at ${filePath}: ${String(readErr)}\n`);
    process.exit(1);
    return;
  }

  const boundary = `boundary_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;

  const metadata: { name: string; parents?: string[] } = { name: fileName };
  if (folderId) {
    metadata.parents = [folderId];
  }

  const metadataJson = JSON.stringify(metadata);

  const bodyParts: Buffer[] = [
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataJson}\r\n`,
      'utf8',
    ),
    Buffer.from(`--${boundary}\r\nContent-Type: ${fileMimeType}\r\n\r\n`, 'utf8'),
    fileContent,
    Buffer.from(`\r\n--${boundary}--`, 'utf8'),
  ];
  const body = Buffer.concat(bodyParts);

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`,
      },
      body,
    },
  );

  if (response.status === 401) {
    process.stderr.write(
      'Error: Access token expired or invalid. Re-run validate-env or reconnect Google.\n',
    );
    process.exit(1);
  }

  if (response.status === 403) {
    process.stderr.write(
      'Error: Insufficient permissions. Check granted scopes in the Google integration settings.\n',
    );
    process.exit(1);
  }

  if (!response.ok) {
    const text = await response.text();
    process.stderr.write(`Error: Drive API returned ${response.status}: ${text}\n`);
    process.exit(1);
  }

  const data = (await response.json()) as UploadResponse;

  process.stdout.write(JSON.stringify(data) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
