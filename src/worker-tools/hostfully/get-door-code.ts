import { getArg } from '../lib/get-arg.js';
import { optionalEnv } from '../lib/require-env.js';
import { resolveHostfullyClient } from './lib/client.js';

function parseArgs(argv: string[]): { propertyId: string; help: boolean } {
  const args = argv.slice(2);
  return {
    propertyId: getArg(args, '--property-id') ?? '',
    help: args.includes('--help'),
  };
}

interface CustomDataField {
  uid: string;
  name: string;
}

interface CustomDataEntry {
  customDataField: CustomDataField;
  text: string;
}

async function main(): Promise<void> {
  const { propertyId, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx hostfully-door-code.ts --property-id <hostfully-property-uid>\n' +
        'Fetches the door code from Hostfully custom data for a given property.\n\n' +
        'Options:\n' +
        '  --property-id <uid>  Hostfully property UID (required)\n' +
        '  --help               Show this help message\n\n' +
        'Environment variables:\n' +
        '  HOSTFULLY_API_KEY    Required. Hostfully API key.\n' +
        '  HOSTFULLY_API_URL    Optional. Base URL (default: https://api.hostfully.com)\n\n' +
        'Output:\n' +
        '  { "doorCode": "1234" }  on success\n' +
        '  { "doorCode": null }    if no door_code field found\n',
    );
    process.exit(0);
  }

  if (!propertyId) {
    process.stderr.write('Error: --property-id argument is required\n');
    process.exit(1);
  }

  const { headers } = resolveHostfullyClient();

  const baseUrl = (optionalEnv('HOSTFULLY_API_URL') ?? 'https://api.hostfully.com').replace(
    /\/$/,
    '',
  );

  const url = `${baseUrl}/api/v3.2/custom-data?propertyUid=${encodeURIComponent(propertyId)}`;

  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch (err) {
    process.stderr.write(`Error: Failed to connect to Hostfully API: ${String(err)}\n`);
    process.exit(1);
  }

  if (!response.ok) {
    process.stderr.write(
      `Error: Hostfully API returned ${response.status} ${response.statusText}\n`,
    );
    process.exit(1);
  }

  let body: { customData?: CustomDataEntry[] } | CustomDataEntry[];
  try {
    body = (await response.json()) as { customData?: CustomDataEntry[] } | CustomDataEntry[];
  } catch (err) {
    process.stderr.write(`Error: Failed to parse Hostfully API response: ${String(err)}\n`);
    process.exit(1);
  }

  const entries: CustomDataEntry[] = Array.isArray(body) ? body : (body.customData ?? []);

  const doorCodeEntry = entries.find((entry) => entry.customDataField.name === 'door_code');

  const doorCode = doorCodeEntry?.text ?? null;

  process.stdout.write(JSON.stringify({ doorCode }) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
