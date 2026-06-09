import { googleFetch, requireEnv } from './google-fetch.js';
import { getArg } from '../lib/get-arg.js';

type DriveFile = {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
};

type ListFilesApiResponse = {
  files?: DriveFile[];
};

type DocumentSummary = {
  id: string;
  name: string;
  modifiedTime: string | null;
  webViewLink: string | null;
};

function parseArgs(argv: string[]): { maxResults: number; help: boolean } {
  const args = argv.slice(2);
  const maxResultsArg = getArg(args, '--max-results');
  return {
    maxResults: maxResultsArg ? parseInt(maxResultsArg, 10) : 20,
    help: args.includes('--help'),
  };
}

async function main(): Promise<void> {
  const { maxResults, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx list-documents.ts [--max-results <number>]\n\n' +
        'Lists Google Docs documents accessible to the authenticated user.\n\n' +
        'Options:\n' +
        '  --max-results <number>  Maximum number of documents to return (default: 20)\n' +
        '  --help                  Show this help message\n\n' +
        'Output: { documents: [{ id, name, modifiedTime, webViewLink }] }\n\n' +
        'Environment variables:\n' +
        '  GOOGLE_ACCESS_TOKEN     (required) OAuth2 access token\n',
    );
    process.exit(0);
  }

  requireEnv('GOOGLE_ACCESS_TOKEN');

  const q = encodeURIComponent("mimeType='application/vnd.google-apps.document'");
  const fields = encodeURIComponent('files(id,name,modifiedTime,webViewLink)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=${maxResults}&fields=${fields}`;

  const response = await googleFetch(url);

  if (!response.ok) {
    const text = await response.text();
    process.stderr.write(`Error: Drive API returned ${response.status}: ${text}\n`);
    process.exit(1);
  }

  const data = (await response.json()) as ListFilesApiResponse;
  const files = data.files ?? [];

  const documents: DocumentSummary[] = files.map((f) => ({
    id: f.id,
    name: f.name,
    modifiedTime: f.modifiedTime ?? null,
    webViewLink: f.webViewLink ?? null,
  }));

  process.stdout.write(JSON.stringify({ documents }) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
