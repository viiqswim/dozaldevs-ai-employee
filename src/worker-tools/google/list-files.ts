import { googleFetch } from './google-fetch.js';
import { getArg } from '../lib/get-arg.js';

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
};

type ListFilesApiResponse = {
  files?: DriveFile[];
};

function parseArgs(argv: string[]): {
  query: string;
  maxResults: number;
  mimeType: string;
  help: boolean;
} {
  const args = argv.slice(2);
  const maxResultsArg = getArg(args, '--max-results');
  return {
    query: getArg(args, '--query') ?? '',
    maxResults: maxResultsArg ? parseInt(maxResultsArg, 10) : 20,
    mimeType: getArg(args, '--mime-type') ?? '',
    help: args.includes('--help'),
  };
}

async function main(): Promise<void> {
  const { query, maxResults, mimeType, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx list-files.ts [--query <string>] [--max-results <number>] [--mime-type <string>]\n\n' +
        'Lists files in Google Drive.\n\n' +
        'Options:\n' +
        '  --query <string>       Drive search query (e.g. "name contains \'report\'")\n' +
        '  --max-results <n>      Maximum number of files to return (default: 20)\n' +
        '  --mime-type <string>   Filter by MIME type (e.g. application/pdf)\n' +
        '  --help                 Show this help message\n\n' +
        'Output: JSON { files: [{ id, name, mimeType, modifiedTime, size, webViewLink }] }\n\n' +
        'Environment variables:\n' +
        '  GOOGLE_ACCESS_TOKEN    (required) OAuth 2.0 access token\n',
    );
    process.exit(0);
  }

  let q = query;
  if (mimeType) {
    const mimeFilter = `mimeType='${mimeType}'`;
    q = q ? `${q} AND ${mimeFilter}` : mimeFilter;
  }

  const fields = 'files(id,name,mimeType,modifiedTime,size,webViewLink)';
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  if (q) url.searchParams.set('q', q);
  url.searchParams.set('pageSize', String(maxResults));
  url.searchParams.set('fields', fields);

  const response = await googleFetch(url.toString());

  if (!response.ok) {
    const text = await response.text();
    process.stderr.write(`Error: Drive API returned ${response.status}: ${text}\n`);
    process.exit(1);
  }

  const data = (await response.json()) as ListFilesApiResponse;
  const files = data.files ?? [];

  process.stdout.write(JSON.stringify({ files }) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
