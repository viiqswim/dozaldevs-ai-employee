import { googleFetch } from './google-fetch.js';

function parseArgs(argv: string[]): {
  spreadsheetId: string;
  range: string;
  values: string;
  help: boolean;
} {
  const args = argv.slice(2);
  let spreadsheetId = '';
  let range = '';
  let values = '';
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--spreadsheet-id' && args[i + 1]) {
      spreadsheetId = args[++i];
    } else if (args[i] === '--range' && args[i + 1]) {
      range = args[++i];
    } else if (args[i] === '--values' && args[i + 1]) {
      values = args[++i];
    } else if (args[i] === '--help') {
      help = true;
    }
  }

  return { spreadsheetId, range, values, help };
}

interface UpdateValuesResponse {
  spreadsheetId: string;
  updatedRange: string;
  updatedRows: number;
  updatedColumns: number;
  updatedCells: number;
}

async function main(): Promise<void> {
  const { spreadsheetId, range, values: valuesRaw, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx update-sheet-data.ts --spreadsheet-id <id> --range <range> --values <json>\n' +
        '\n' +
        'Updates data in a Google Sheets range via the Sheets API v4.\n' +
        '\n' +
        'Options:\n' +
        '  --spreadsheet-id <string>  Required. The ID of the spreadsheet.\n' +
        '  --range <string>           Required. The A1 notation range, e.g. "Sheet1!A1:B2".\n' +
        '  --values <json-string>     Required. 2D array as JSON, e.g. \'[["A","B"],["1","2"]]\'.\n' +
        '  --help                     Show this help message\n' +
        '\n' +
        'Environment:\n' +
        '  GOOGLE_ACCESS_TOKEN        Required. OAuth2 access token with spreadsheets scope.\n' +
        '\n' +
        'Output: { updatedRange, updatedRows, updatedColumns, updatedCells }\n',
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

  if (!valuesRaw) {
    process.stderr.write('Error: --values is required\n');
    process.exit(1);
  }

  let parsedValues: string[][];
  try {
    parsedValues = JSON.parse(valuesRaw) as string[][];
    if (!Array.isArray(parsedValues) || !parsedValues.every((row) => Array.isArray(row))) {
      throw new Error('not a 2D array');
    }
  } catch {
    process.stderr.write('Error: --values must be a valid JSON 2D array\n');
    process.exit(1);
  }

  const encodedRange = encodeURIComponent(range);
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}` +
    `?valueInputOption=USER_ENTERED`;

  const response = await googleFetch(url, {
    method: 'PUT',
    body: JSON.stringify({ range, values: parsedValues }),
  });

  if (!response.ok) {
    const body = await response.text();
    process.stderr.write(`Error: Sheets API returned ${response.status}: ${body}\n`);
    process.exit(1);
  }

  const data = (await response.json()) as UpdateValuesResponse;

  process.stdout.write(
    JSON.stringify({
      updatedRange: data.updatedRange,
      updatedRows: data.updatedRows,
      updatedColumns: data.updatedColumns,
      updatedCells: data.updatedCells,
    }) + '\n',
  );
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
