import { getArg } from '../lib/get-arg.js';
import { optionalEnv } from '../lib/require-env.js';
import { resolveHostfullyClient } from './lib/client.js';
import type { ToolDescriptor } from '../lib/types.js';

export const descriptor: ToolDescriptor = {
  id: 'update-door-code',
  service: 'hostfully',
  description: 'Update the door code for a Hostfully property in custom data fields',
  envVars: ['HOSTFULLY_API_KEY'],
  args: [
    {
      name: '--property-id',
      required: true,
      description: 'Hostfully property UID',
      type: 'string',
    },
    { name: '--code', required: true, description: 'New door code value', type: 'string' },
  ],
};

function parseArgs(argv: string[]): { propertyId: string; code: string; help: boolean } {
  const args = argv.slice(2);
  return {
    propertyId: getArg(args, '--property-id') ?? '',
    code: getArg(args, '--code') ?? '',
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
  const { propertyId, code, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx update-door-code.ts --property-id <hostfully-property-uid> --code <digits>\n' +
        'Updates the door_code custom data field for a Hostfully property via GET-then-POST.\n\n' +
        'Options:\n' +
        '  --property-id <uid>  Hostfully property UID (required)\n' +
        '  --code <digits>      New door code digits to set (required)\n' +
        '  --help               Show this help message\n\n' +
        'Environment variables:\n' +
        '  HOSTFULLY_API_KEY    Required. Hostfully API key.\n' +
        '  HOSTFULLY_API_URL    Optional. Base URL (default: https://api.hostfully.com)\n\n' +
        'Exit codes:\n' +
        '  0  Success\n' +
        '  1  General error (missing args, API failure, etc.)\n' +
        '  2  door_code field not found in property custom data\n\n' +
        'Output:\n' +
        '  { "success": true, "propertyId": "...", "previousCode": "...", "newCode": "..." }\n',
    );
    process.exit(0);
  }

  if (!propertyId) {
    process.stderr.write('Error: --property-id argument is required\n');
    process.exit(1);
  }

  if (!code) {
    process.stderr.write('Error: --code argument is required\n');
    process.exit(1);
  }

  const { headers } = resolveHostfullyClient();

  const baseUrl = (optionalEnv('HOSTFULLY_API_URL') ?? 'https://api.hostfully.com').replace(
    /\/$/,
    '',
  );

  const getUrl = `${baseUrl}/api/v3.2/custom-data?propertyUid=${encodeURIComponent(propertyId)}`;

  let getResponse: Response;
  try {
    getResponse = await fetch(getUrl, { headers });
  } catch (err) {
    process.stderr.write(`Error: Failed to connect to Hostfully API: ${String(err)}\n`);
    process.exit(1);
  }

  if (!getResponse.ok) {
    process.stderr.write(
      `Error: Hostfully API returned ${getResponse.status} ${getResponse.statusText}\n`,
    );
    process.exit(1);
  }

  let getBody: { customData?: CustomDataEntry[] } | CustomDataEntry[];
  try {
    getBody = (await getResponse.json()) as { customData?: CustomDataEntry[] } | CustomDataEntry[];
  } catch (err) {
    process.stderr.write(`Error: Failed to parse Hostfully API response: ${String(err)}\n`);
    process.exit(1);
  }

  const entries: CustomDataEntry[] = Array.isArray(getBody) ? getBody : (getBody.customData ?? []);

  const doorCodeEntry = entries.find((entry) => entry.customDataField.name === 'door_code');

  if (!doorCodeEntry) {
    process.stderr.write(
      `Warning: door_code field not found in custom data for property ${propertyId}\n`,
    );
    process.exit(2);
  }

  const previousCode = doorCodeEntry.text;
  const fieldUid = doorCodeEntry.customDataField.uid;

  // Step 2: POST to update the door_code value (Hostfully custom-data is UPSERT via POST)
  const postUrl = `${baseUrl}/api/v3.2/custom-data`;

  let postResponse: Response;
  try {
    postResponse = await fetch(postUrl, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        propertyUid: propertyId,
        customDataFieldUid: fieldUid,
        text: code,
      }),
    });
  } catch (err) {
    process.stderr.write(`Error: Failed to connect to Hostfully API for update: ${String(err)}\n`);
    process.exit(1);
  }

  if (!postResponse.ok) {
    process.stderr.write(
      `Error: Hostfully API update returned ${postResponse.status} ${postResponse.statusText}\n`,
    );
    process.exit(1);
  }

  process.stdout.write(
    JSON.stringify({
      success: true,
      propertyId,
      previousCode,
      newCode: code,
    }) + '\n',
  );
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
