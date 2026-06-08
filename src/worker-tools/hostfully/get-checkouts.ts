import { resolveHostfullyClient } from './lib/client.js';
import { paginateCursor } from './lib/paginate.js';
import { formatGuestName } from './lib/format.js';
import { getArg } from '../lib/get-arg.js';
import { requireEnv, optionalEnv } from '../lib/require-env.js';

type RawProperty = {
  uid: string;
  name?: string;
  isActive?: boolean;
};

type RawLead = {
  uid: string;
  propertyUid?: string;
  type?: string;
  status?: string;
  channel?: string;
  checkInLocalDateTime?: string | null;
  checkOutLocalDateTime?: string | null;
  guestInformation?: {
    firstName?: string | null;
    lastName?: string | null;
    adultCount?: number;
    childrenCount?: number;
  };
};

type CheckoutItem = {
  propertyUid: string;
  listingName: string;
  normalizedAddress: string | null;
  roomId: string;
  zipCode: string | null;
  city: string;
  checkIn: string | null;
  checkOut: string | null;
  checkOutTime: string;
  guestName: string | null;
  status: string | null;
  channel: string | null;
};

const CONFIRMED_STATUSES = new Set([
  'BOOKED',
  'BOOKED_BY_AGENT',
  'BOOKED_BY_CUSTOMER',
  'BOOKED_EXTERNALLY',
  'STAY',
]);

const ZIP_CITY: Record<string, string> = {
  '78640': 'Kyle, TX',
  '78744': 'Austin, TX',
  '78722': 'Austin, TX',
  '78203': 'San Antonio, TX',
  '78109': 'Converse, TX',
  '80421': 'Bailey, CO',
};

function parseArgs(argv: string[]): { date: string; help: boolean } {
  const args = argv.slice(2);
  return {
    date: getArg(args, '--date') ?? '',
    help: args.includes('--help'),
  };
}

function normalizeAddress(rawAddress: string | null | undefined): string | null {
  if (!rawAddress) return null;
  // "4405 - A Hayride lane" → "4405 Hayride lane" (strip embedded unit letter from street address)
  let addr = rawAddress.replace(/^(\d+)\s*-\s*[A-Za-z]\s+/, '$1 ');
  addr = addr
    .replace(/\blane\b/gi, 'Lane')
    .replace(/\brd\b/gi, 'Rd')
    .replace(/\bdr\b/gi, 'Dr')
    .replace(/\bst\b/gi, 'St')
    .replace(/\bave\b/gi, 'Ave')
    .replace(/\bblvd\b/gi, 'Blvd')
    .replace(/\brun\b/gi, 'Run')
    .replace(/\bct\b/gi, 'Ct')
    .replace(/\bway\b/gi, 'Way');
  return addr.trim();
}

function deriveRoomId(listingName: string): string {
  const name = listingName.trim();
  // "3505-BAN-1" → "Habitación 1", "7213-NUT-4" → "Habitación 4"
  const digitMatch = name.match(/-(\d+)$/);
  if (digitMatch) return `Habitación ${digitMatch[1]}`;
  if (name.toUpperCase().endsWith('-LOFT')) return 'Loft';
  // "4403B-HAY-HOME" → "Unidad B", "4405A-HAY-HOME" → "Unidad A"
  const unitLetterMatch = name.match(/^\d+([A-Za-z])-/);
  if (unitLetterMatch) return `Unidad ${unitLetterMatch[1].toUpperCase()}`;
  return 'Casa';
}

function formatCheckOutTime(
  checkOutTimeRaw: number | null | undefined,
  checkOutDatetime: string | null | undefined,
): string {
  if (checkOutTimeRaw != null) {
    if (checkOutTimeRaw < 24) {
      // Hostfully returns raw hour value (e.g., 11 = 11:00 AM)
      return `${String(checkOutTimeRaw).padStart(2, '0')}:00`;
    }
    // HHMM integer format (e.g., 1100 = 11:00 AM)
    const hours = Math.floor(checkOutTimeRaw / 100);
    const mins = checkOutTimeRaw % 100;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }
  if (checkOutDatetime) {
    const match = checkOutDatetime.match(/T(\d{2}:\d{2})/);
    if (match) return match[1];
  }
  return '11:00';
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function fetchPropertyDetail(
  baseUrl: string,
  headers: Record<string, string>,
  propertyUid: string,
): Promise<{
  address: string | null;
  zipCode: string | null;
  checkOutTime: number | null;
}> {
  const res = await fetch(`${baseUrl}/properties/${propertyUid}`, { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch property detail ${propertyUid}: ${res.status}`);
  }

  const json = (await res.json()) as {
    property?: Record<string, unknown>;
    [key: string]: unknown;
  };

  const property = (json.property ?? json) as {
    address?:
      | {
          address?: string;
          city?: string;
          state?: string;
          zipCode?: string;
        }
      | string;
    availability?: { checkOutTime?: number };
  };

  let rawAddress: string | null = null;
  let zipCode: string | null = null;

  if (typeof property.address === 'string') {
    rawAddress = property.address;
  } else if (property.address && typeof property.address === 'object') {
    const addrObj = property.address as {
      address?: string;
      city?: string;
      state?: string;
      zipCode?: string;
    };
    zipCode = addrObj.zipCode ?? null;
    rawAddress = addrObj.address ?? null;
  }

  const checkOutTime = property.availability?.checkOutTime ?? null;

  return { address: rawAddress, zipCode, checkOutTime };
}

async function main(): Promise<void> {
  const { date: targetDate, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx get-checkouts.ts --date YYYY-MM-DD\n' +
        'Fetches all confirmed property checkouts for a given date.\n\n' +
        'Options:\n' +
        '  --date <YYYY-MM-DD>  (required) Target checkout date\n' +
        '  --help               Show this help message\n\n' +
        'Environment variables:\n' +
        '  HOSTFULLY_API_KEY      (required) Hostfully API key\n' +
        '  HOSTFULLY_AGENCY_UID   (required) Hostfully agency UID\n' +
        '  HOSTFULLY_API_URL      (optional) Base API URL (default: https://api.hostfully.com/api/v3.2)\n' +
        '  HOSTFULLY_MOCK         (optional) Set to "true" to return fixture data\n\n' +
        'Output: JSON array of CheckoutItem objects with normalized address, roomId, city, checkOutTime.\n',
    );
    process.exit(0);
  }

  if (optionalEnv('HOSTFULLY_MOCK') === 'true') {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const fixturePath = join(__dirname, 'fixtures', 'get-checkouts.json');
    const fixtureData = readFileSync(fixturePath, 'utf8');
    process.stdout.write(fixtureData.trimEnd() + '\n');
    return;
  }

  if (!targetDate) {
    process.stderr.write('Error: --date argument is required (format: YYYY-MM-DD)\n');
    process.exit(1);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    process.stderr.write('Error: --date must be in YYYY-MM-DD format\n');
    process.exit(1);
  }

  const agencyUid = requireEnv('HOSTFULLY_AGENCY_UID');

  const { headers, baseUrl } = resolveHostfullyClient();

  // --from/--to filters by check-IN date; broad range captures all reservations that could check out on targetDate
  const fromDate = shiftDate(targetDate, -60);
  const toDate = shiftDate(targetDate, 30);

  let properties: RawProperty[];
  try {
    properties = await paginateCursor<RawProperty>(
      `${baseUrl}/properties?agencyUid=${encodeURIComponent(agencyUid)}`,
      headers,
      (json) => {
        const j = json as { properties?: RawProperty[]; _paging?: { _nextCursor?: string } };
        return { items: j.properties ?? [], nextCursor: j._paging?._nextCursor };
      },
    );
  } catch (err) {
    process.stderr.write(`Error: ${String(err)}\n`);
    process.exit(1);
  }

  type MatchedLead = { property: RawProperty; lead: RawLead };
  const matched: MatchedLead[] = [];

  for (const property of properties) {
    let leads: RawLead[];
    try {
      const queryBase =
        `${baseUrl}/leads?propertyUid=${encodeURIComponent(property.uid)}` +
        `&checkInFrom=${encodeURIComponent(fromDate)}&checkInTo=${encodeURIComponent(toDate)}`;
      leads = await paginateCursor<RawLead>(queryBase, headers, (json) => {
        const j = json as { leads?: RawLead[]; _paging?: { _nextCursor?: string } };
        return { items: j.leads ?? [], nextCursor: j._paging?._nextCursor };
      });
    } catch (err) {
      process.stderr.write(
        `Warning: ${String(err)} — skipping property ${property.name ?? property.uid}\n`,
      );
      continue;
    }

    for (const lead of leads) {
      if (lead.type !== 'BOOKING') continue;
      if (!CONFIRMED_STATUSES.has(lead.status ?? '')) continue;
      if (!lead.checkOutLocalDateTime) continue;
      if (lead.checkOutLocalDateTime.substring(0, 10) !== targetDate) continue;

      matched.push({ property, lead });
    }
  }

  if (matched.length === 0) {
    process.stdout.write('[]\n');
    return;
  }

  const uniquePropertyUids = [...new Set(matched.map((m) => m.property.uid))];
  const propertyDetailMap = new Map<
    string,
    { address: string | null; zipCode: string | null; checkOutTime: number | null }
  >();

  await Promise.all(
    uniquePropertyUids.map(async (uid) => {
      try {
        const detail = await fetchPropertyDetail(baseUrl, headers, uid);
        propertyDetailMap.set(uid, detail);
      } catch (err) {
        process.stderr.write(
          `Warning: Failed to fetch property detail for ${uid}: ${String(err)} — using fallback\n`,
        );
        propertyDetailMap.set(uid, { address: null, zipCode: null, checkOutTime: null });
      }
    }),
  );

  const results: CheckoutItem[] = matched.map(({ property, lead }) => {
    const detail = propertyDetailMap.get(property.uid) ?? {
      address: null,
      zipCode: null,
      checkOutTime: null,
    };

    const listingName = property.name ?? property.uid;
    const normalizedAddr = normalizeAddress(detail.address) ?? listingName;
    const roomId = deriveRoomId(listingName);
    const zipCode = detail.zipCode ?? null;
    const city = (zipCode && ZIP_CITY[zipCode]) ?? 'Austin, TX';
    const checkOutTime = formatCheckOutTime(detail.checkOutTime, lead.checkOutLocalDateTime);

    return {
      propertyUid: property.uid,
      listingName,
      normalizedAddress: normalizedAddr,
      roomId,
      zipCode,
      city,
      checkIn: lead.checkInLocalDateTime ?? null,
      checkOut: lead.checkOutLocalDateTime ?? null,
      checkOutTime,
      guestName: formatGuestName(lead.guestInformation),
      status: lead.status ?? null,
      channel: lead.channel ?? null,
    };
  });

  process.stdout.write(JSON.stringify(results) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
