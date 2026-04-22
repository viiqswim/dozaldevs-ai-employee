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

function parseArgs(argv: string[]): { help: boolean } {
  const args = argv.slice(2);
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help') {
      help = true;
    }
  }

  return { help };
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

  const apiKey = process.env['HOSTFULLY_API_KEY'];
  if (!apiKey) {
    process.stderr.write('Error: HOSTFULLY_API_KEY environment variable is required\n');
    process.exit(1);
  }

  const agencyUid = process.env['HOSTFULLY_AGENCY_UID'];
  if (!agencyUid) {
    process.stderr.write('Error: HOSTFULLY_AGENCY_UID environment variable is required\n');
    process.exit(1);
  }

  const baseUrl = process.env['HOSTFULLY_API_URL'] ?? 'https://api.hostfully.com/api/v3.2';

  const headers = { 'X-HOSTFULLY-APIKEY': apiKey, Accept: 'application/json' };
  const seenUids = new Set<string>();
  const allProperties: PropertySummary[] = [];
  let cursor: string | undefined = undefined;

  do {
    const url = cursor
      ? `${baseUrl}/properties?agencyUid=${encodeURIComponent(agencyUid)}&cursor=${encodeURIComponent(cursor)}`
      : `${baseUrl}/properties?agencyUid=${encodeURIComponent(agencyUid)}`;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      process.stderr.write(`Error: Failed to fetch properties: ${res.status}\n`);
      process.exit(1);
    }

    const json = (await res.json()) as {
      properties?: RawProperty[];
      _paging?: { _nextCursor?: string };
    };

    const page = json.properties ?? [];
    let hasNew = false;
    for (const p of page) {
      if (p.uid && !seenUids.has(p.uid)) {
        seenUids.add(p.uid);
        allProperties.push(curateProperty(p));
        hasNew = true;
      }
    }

    cursor = json._paging?._nextCursor;
    if (!hasNew || !cursor) break;
  } while (true);

  process.stdout.write(JSON.stringify(allProperties) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
