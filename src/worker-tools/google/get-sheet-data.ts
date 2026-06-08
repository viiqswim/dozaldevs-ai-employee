import { googleFetch } from './google-fetch.js';
import { getArg } from '../lib/get-arg.js';

function parseArgs(argv: string[]): {
  spreadsheetId: string;
  range: string;
  help: boolean;
} {
  const args = argv.slice(2);
  return {
    spreadsheetId: getArg(args, '--spreadsheet-id') ?? '',
    range: getArg(args, '--range') ?? '',
    help: args.includes('--help'),
  };
}

interface SheetsValuesResponse {
  spreadsheetId: string;
  range: string;
  majorDimension: string;
  values?: string[][];
}

async function main(): Promise<void> {
  const { spreadsheetId, range, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx get-sheet-data.ts --spreadsheet-id <id> --range <range>\n' +
        '\n' +
        'Fetches data from a Google Sheets range via the Sheets API v4.\n' +
        '\n' +
        'Options:\n' +
        '  --spreadsheet-id <string>  Required. The ID of the spreadsheet.\n' +
        '  --range <string>           Required. The A1 notation range, e.g. "Sheet1!A1:D10".\n' +
        '  --help                     Show this help message\n' +
        '\n' +
        'Environment:\n' +
        '  GOOGLE_ACCESS_TOKEN        Required. OAuth2 access token with spreadsheets.readonly scope.\n' +
        '\n' +
        'Output: { spreadsheetId, range, values: string[][] }\n',
    );
    process.exit(0);
  }

  if (!spreadsheetId) {
    process.stderr.write('Error: --spreadsheet-id is required\n');
    process.exit(1);
  }

  if (!range) {
    process.stderr.write('Error: --range is required\n');
    process.exit(1);
  }

  const encodedRange = encodeURIComponent(range);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}`;

  const response = await googleFetch(url);

  if (!response.ok) {
    const body = await response.text();
    process.stderr.write(`Error: Sheets API returned ${response.status}: ${body}\n`);
    process.exit(1);
  }

  const data = (await response.json()) as SheetsValuesResponse;

  process.stdout.write(
    JSON.stringify({
      spreadsheetId: data.spreadsheetId,
      range: data.range,
      values: data.values ?? [],
    }) + '\n',
  );
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
