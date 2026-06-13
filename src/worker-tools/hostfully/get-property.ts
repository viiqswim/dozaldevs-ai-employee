import { getArg } from '../lib/get-arg.js';
import { optionalEnv } from '../lib/require-env.js';
import { resolveHostfullyClient } from './lib/client.js';
import type { ToolDescriptor } from '../lib/types.js';

export const descriptor: ToolDescriptor = {
  id: 'get-property',
  service: 'hostfully',
  description: 'Fetch details for a single Hostfully property by UID',
  envVars: ['HOSTFULLY_API_KEY'],
  args: [
    {
      name: '--property-id',
      required: true,
      description: 'Hostfully property UID',
      type: 'string',
    },
  ],
};

function parseArgs(argv: string[]): { propertyId: string; help: boolean } {
  const args = argv.slice(2);
  return {
    propertyId: getArg(args, '--property-id') ?? '',
    help: args.includes('--help'),
  };
}

function formatAddress(
  addr:
    | { address?: string; city?: string; state?: string; zipCode?: string; countryCode?: string }
    | string
    | null
    | undefined,
): string | null {
  if (!addr) return null;
  if (typeof addr === 'string') return addr;
  const parts = [addr.address, addr.city, addr.state, addr.zipCode, addr.countryCode].filter(
    (p) => p !== null && p !== undefined && p !== '',
  );
  return parts.length > 0 ? parts.join(', ') : null;
}

async function main(): Promise<void> {
  const { propertyId, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: node get-property.js --property-id <uid>\nFetches property details from the Hostfully API.\n',
    );
    process.exit(0);
  }

  // HOSTFULLY_MOCK: return fixture data instead of calling the real API.
  // Set HOSTFULLY_MOCK=true in .env for local E2E testing without real Hostfully credentials.
  if (process.env['HOSTFULLY_MOCK'] === 'true') {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const fixturePath = join(__dirname, 'fixtures', 'get-property', 'default.json');
    const fixtureData = readFileSync(fixturePath, 'utf8');
    process.stdout.write(fixtureData.trimEnd() + '\n');
    return;
  }

  if (!propertyId) {
    process.stderr.write('Error: --property-id argument is required\n');
    process.exit(1);
  }

  const { headers } = resolveHostfullyClient();

  const baseUrl = optionalEnv('HOSTFULLY_API_URL') ?? 'https://api.hostfully.com/api/v3.2';

  const [propertyResult, amenitiesResult, rulesResult] = await Promise.allSettled([
    fetch(`${baseUrl}/properties/${propertyId}`, { headers }),
    fetch(`${baseUrl}/amenities?propertyUid=${propertyId}`, { headers }),
    fetch(`${baseUrl}/property-rules?propertyUid=${propertyId}`, { headers }),
  ]);

  if (propertyResult.status === 'rejected' || !propertyResult.value.ok) {
    const reason =
      propertyResult.status === 'rejected'
        ? String(propertyResult.reason)
        : String(propertyResult.value.status);
    process.stderr.write(`Error: Failed to fetch property ${propertyId}: ${reason}\n`);
    process.exit(1);
  }

  let amenitiesJson: { amenities?: { amenity: string }[] } | null = null;
  if (amenitiesResult.status === 'rejected' || !amenitiesResult.value.ok) {
    const reason =
      amenitiesResult.status === 'rejected'
        ? String(amenitiesResult.reason)
        : String(amenitiesResult.value.status);
    process.stderr.write(`Warning: Failed to fetch amenities: ${reason}\n`);
  } else {
    amenitiesJson = (await amenitiesResult.value.json()) as { amenities?: { amenity: string }[] };
  }

  let rulesJson: { propertyRules?: { rule: string; description?: string }[] } | null = null;
  if (rulesResult.status === 'rejected' || !rulesResult.value.ok) {
    const reason =
      rulesResult.status === 'rejected'
        ? String(rulesResult.reason)
        : String(rulesResult.value.status);
    process.stderr.write(`Warning: Failed to fetch property rules: ${reason}\n`);
  } else {
    rulesJson = (await rulesResult.value.json()) as {
      propertyRules?: { rule: string; description?: string }[];
    };
  }

  const propertyJson = (await propertyResult.value.json()) as {
    property?: Record<string, unknown>;
    [key: string]: unknown;
  };

  const property = (propertyJson.property ?? propertyJson) as {
    uid?: string;
    name?: string;
    propertyType?: string;
    address?:
      | { address?: string; city?: string; state?: string; zipCode?: string; countryCode?: string }
      | string;
    bedrooms?: number;
    beds?: number;
    bathrooms?: string | number;
    availability?: { maxGuests?: number; checkInTimeStart?: number; checkOutTime?: number };
    wifiNetwork?: string;
    wifiPassword?: string;
    bookingNotes?: string;
    extraNotes?: string;
    guideBookUrl?: string;
  };

  const amenities = amenitiesJson?.amenities ?? [];
  const rules = rulesJson?.propertyRules ?? [];

  const output = {
    uid: property.uid ?? null,
    name: property.name ?? null,
    propertyType: property.propertyType ?? null,
    address: formatAddress(property.address) ?? null,
    bedrooms: property.bedrooms ?? null,
    beds: property.beds ?? null,
    bathrooms: property.bathrooms ?? null,
    maxGuests: property.availability?.maxGuests ?? null,
    checkInTime: property.availability?.checkInTimeStart ?? null,
    checkOutTime: property.availability?.checkOutTime ?? null,
    wifiNetwork: property.wifiNetwork ?? null,
    wifiPassword: property.wifiPassword ?? null,
    bookingNotes: property.bookingNotes ?? null,
    extraNotes: property.extraNotes ?? null,
    guideBookUrl: property.guideBookUrl ?? null,
    amenities: amenities.map((a: { amenity: string }) => a.amenity),
    houseRules: rules.map((r: { rule: string; description?: string }) => ({
      rule: r.rule,
      description: r.description ?? null,
    })),
  };

  process.stdout.write(JSON.stringify(output) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
