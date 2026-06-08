import { googleFetch } from './google-fetch.js';
import { getArg } from '../lib/get-arg.js';

function parseArgs(argv: string[]): { maxResults: number; help: boolean } {
  const args = argv.slice(2);
  const maxResultsArg = getArg(args, '--max-results');
  return {
    maxResults: maxResultsArg ? parseInt(maxResultsArg, 10) : 20,
    help: args.includes('--help'),
  };
}

interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  webViewLink: string;
}

interface DriveFilesResponse {
  files: DriveFile[];
}

async function main(): Promise<void> {
  const { maxResults, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx list-spreadsheets.ts [--max-results <number>]\n' +
        '\n' +
        'Lists Google Sheets accessible to the authenticated user via Drive API.\n' +
        '\n' +
        'Options:\n' +
        '  --max-results <number>  Maximum number of spreadsheets to return (default: 20)\n' +
        '  --help                  Show this help message\n' +
        '\n' +
        'Environment:\n' +
        '  GOOGLE_ACCESS_TOKEN     Required. OAuth2 access token with drive.readonly scope.\n' +
        '\n' +
        'Output: { spreadsheets: [{ id, name, modifiedTime, webViewLink }] }\n',
    );
    process.exit(0);
  }

  const url =
    `https://www.googleapis.com/drive/v3/files` +
    `?q=mimeType%3D'application%2Fvnd.google-apps.spreadsheet'` +
    `&pageSize=${maxResults}` +
    `&fields=files(id,name,modifiedTime,webViewLink)`;

  const response = await googleFetch(url);

  if (!response.ok) {
    const body = await response.text();
    process.stderr.write(`Error: Drive API returned ${response.status}: ${body}\n`);
    process.exit(1);
  }

  const data = (await response.json()) as DriveFilesResponse;

  const spreadsheets = (data.files ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    modifiedTime: f.modifiedTime,
    webViewLink: f.webViewLink,
  }));

  process.stdout.write(JSON.stringify({ spreadsheets }) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
