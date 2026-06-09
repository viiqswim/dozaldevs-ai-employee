type RawProperty = {
  uid: string;
  name?: string;
  propertyType?: string;
  address?: { city?: string; state?: string };
  bedrooms?: number;
  availability?: { maxGuests?: number };
  isActive?: boolean;
};

type PropertySummary = {
  uid: string;
  name: string | null;
  propertyType: string | null;
  city: string | null;
  state: string | null;
  bedrooms: number | null;
  maxGuests: number | null;
  isActive: boolean | null;
};

import { resolveHostfullyClient } from './lib/client.js';
import { paginateCursor } from './lib/paginate.js';
import { requireEnv } from '../lib/require-env.js';

function parseArgs(argv: string[]): { help: boolean } {
  const args = argv.slice(2);
  return {
    help: args.includes('--help'),
  };
}

function curateProperty(p: RawProperty): PropertySummary {
  return {
    uid: p.uid,
    name: p.name ?? null,
    propertyType: p.propertyType ?? null,
    city: p.address?.city ?? null,
    state: p.address?.state ?? null,
    bedrooms: p.bedrooms ?? null,
    maxGuests: p.availability?.maxGuests ?? null,
    isActive: p.isActive ?? null,
  };
}

async function main(): Promise<void> {
  const { help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: node get-properties.js\nFetches all properties from the Hostfully API.\n\nOptions:\n  --help  Show this help message\n\nEnvironment variables:\n  HOSTFULLY_API_KEY      (required) Hostfully API key\n  HOSTFULLY_AGENCY_UID   (required) Hostfully agency UID\n  HOSTFULLY_API_URL      (optional) Base API URL (default: https://api.hostfully.com/api/v3.2)\n',
    );
    process.exit(0);
  }

  const agencyUid = requireEnv('HOSTFULLY_AGENCY_UID');

  const { headers, baseUrl } = resolveHostfullyClient();

  let rawProperties: RawProperty[];
  try {
    rawProperties = await paginateCursor<RawProperty>(
      `${baseUrl}/properties?agencyUid=${encodeURIComponent(agencyUid)}`,
      headers,
      (json) => {
        const j = json as { properties?: RawProperty[]; _paging?: { _nextCursor?: string } };
        return { items: j.properties ?? [], nextCursor: j._paging?._nextCursor };
      },
    );
  } catch (err) {
    process.stderr.write(`Error: Failed to fetch properties: ${String(err)}\n`);
    process.exit(1);
  }

  const allProperties = rawProperties.map(curateProperty);

  process.stdout.write(JSON.stringify(allProperties) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
