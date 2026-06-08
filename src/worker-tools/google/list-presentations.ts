import { googleFetch } from './google-fetch.js';
import { getArg } from '../lib/get-arg.js';

interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  webViewLink: string;
}

interface DriveFilesResponse {
  files: DriveFile[];
}

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
      'Usage: tsx list-presentations.ts [--max-results <number>]\n' +
        '\n' +
        'Lists Google Slides presentations accessible to the authenticated user.\n' +
        '\n' +
        'Options:\n' +
        '  --max-results <number>  Maximum number of presentations to return (default: 20)\n' +
        '  --help                  Show this help message\n' +
        '\n' +
        'Environment:\n' +
        '  GOOGLE_ACCESS_TOKEN  Required. OAuth2 access token with Drive read scope.\n' +
        '\n' +
        'Output: JSON { presentations: [{ id, name, modifiedTime, webViewLink }] }\n',
    );
    process.exit(0);
  }

  const query = encodeURIComponent("mimeType='application/vnd.google-apps.presentation'");
  const fields = encodeURIComponent('files(id,name,modifiedTime,webViewLink)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&pageSize=${maxResults}&fields=${fields}`;

  const response = await googleFetch(url);

  if (!response.ok) {
    const body = await response.text();
    process.stderr.write(`Error: Drive API returned ${response.status}: ${body}\n`);
    process.exit(1);
  }

  const data = (await response.json()) as DriveFilesResponse;

  const presentations = (data.files ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    modifiedTime: f.modifiedTime,
    webViewLink: f.webViewLink,
  }));

  process.stdout.write(JSON.stringify({ presentations }) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
