/**
 * Fetches reservations for a Hostfully property.
 *
 * DOMAIN MODEL — Hostfully calls reservations "leads". The `/api/v3.2/leads`
 * endpoint is the only way to retrieve reservation data. Every lead has a `type`:
 *
 *   BOOKING          — A confirmed (or active) guest reservation. This is what
 *                      most callers want.
 *   BLOCK            — An owner/manager calendar block (e.g. maintenance, personal
 *                      use). Not guest-facing; irrelevant for guest reporting.
 *   INQUIRY          — A guest question or availability check. No booking has
 *                      occurred yet.
 *   BOOKING_REQUEST  — A pending reservation awaiting host approval. Not yet
 *                      confirmed; excluded from default results.
 *
 * DEFAULT FILTER: All leads except BLOCKs are returned unless --status is
 * specified. Airbnb and other OTAs may surface real stays as INQUIRY type,
 * so excluding them would miss legitimate guest conversations.
 *
 * CLIENT-SIDE FILTERING: The Hostfully API has no server-side type or status
 * filter. All type/status filtering happens here after fetching all pages.
 */
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

type ReservationSummary = {
  uid: string;
  propertyUid: string | null;
  guestName: string | null;
  checkIn: string | null;
  checkOut: string | null;
  channel: string | null;
  numberOfGuests: number;
  status: string | null;
};

import { resolveHostfullyClient } from './lib/client.js';
import { paginateCursor } from './lib/paginate.js';
import { formatGuestName } from './lib/format.js';
import { CONFIRMED_STATUSES } from './lib/constants.js';
import { getArg } from '../lib/get-arg.js';
import { optionalEnv } from '../lib/require-env.js';

function parseArgs(argv: string[]): {
  propertyId: string;
  status: string;
  from: string;
  to: string;
  help: boolean;
} {
  const args = argv.slice(2);
  return {
    propertyId: getArg(args, '--property-id') ?? '',
    status: getArg(args, '--status') ?? '',
    from: getArg(args, '--from') ?? '',
    to: getArg(args, '--to') ?? '',
    help: args.includes('--help'),
  };
}

async function main(): Promise<void> {
  const { propertyId, status, from, to, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: node get-reservations.js --property-id <uid> [--status <status>] [--from <date>] [--to <date>]\n' +
        'Fetches reservations for a property from the Hostfully API.\n' +
        'Note: Hostfully calls reservations "leads" internally; this script translates that to reservations.\n\n' +
        'Options:\n' +
        '  --property-id <uid>  (required) Property UID\n' +
        '  --status <status>    Filter by status group:\n' +
        '                         confirmed  — active bookings (BOOKED, STAY, etc.); default when omitted\n' +
        '                         cancelled  — any cancellation variant (by guest, owner, or system)\n' +
        '                         inquiry    — guest inquiries/questions (not actual bookings)\n' +
        '                       Without --status, all non-BLOCK leads are returned (BOOKING, INQUIRY, etc.).\n' +
        '                       Calendar blocks are always excluded.\n' +
        '  --from <date>        Filter by check-in from date (YYYY-MM-DD)\n' +
        '  --to <date>          Filter by check-in to date (YYYY-MM-DD)\n' +
        '                       Without --from/--to, last 30 days + future reservations are shown.\n' +
        '  --help               Show this help message\n\n' +
        'Environment variables:\n' +
        '  HOSTFULLY_API_KEY    (required) Hostfully API key\n' +
        '  HOSTFULLY_API_URL    (optional) Base API URL (default: https://api.hostfully.com/api/v3.2)\n',
    );
    process.exit(0);
  }

  // HOSTFULLY_MOCK: return fixture data instead of calling the real API.
  // Set HOSTFULLY_MOCK=true in .env for local E2E testing without real Hostfully credentials.
  if (optionalEnv('HOSTFULLY_MOCK') === 'true') {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const fixturePath = join(__dirname, 'fixtures', 'get-reservations', 'default.json');
    const fixtureData = readFileSync(fixturePath, 'utf8');
    process.stdout.write(fixtureData.trimEnd() + '\n');
    return;
  }

  if (!propertyId) {
    process.stderr.write('Error: --property-id argument is required\n');
    process.exit(1);
  }

  const { headers, baseUrl } = resolveHostfullyClient();

  let queryBase = `${baseUrl}/leads?propertyUid=${encodeURIComponent(propertyId)}`;

  if (from) {
    queryBase += `&checkInFrom=${encodeURIComponent(from)}`;
  }
  if (to) {
    queryBase += `&checkInTo=${encodeURIComponent(to)}`;
  }
  // Default to last 30 days + future so we include recently checked-out guests
  // (CLOSED leads) who may still be messaging. Without this, the AI model can't
  // find reservation details for guests who checked out yesterday.
  if (!from && !to) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    queryBase += `&checkInFrom=${thirtyDaysAgo}`;
  }

  let allLeads: RawLead[];
  try {
    allLeads = await paginateCursor<RawLead>(queryBase, headers, (json) => {
      const j = json as { leads?: RawLead[]; _paging?: { _nextCursor?: string } };
      return { items: j.leads ?? [], nextCursor: j._paging?._nextCursor };
    });
  } catch (err) {
    process.stderr.write(`Error: Failed to fetch reservations: ${String(err)}\n`);
    process.exit(1);
  }

  // CANCELLED_STATUSES: any cancellation variant regardless of who initiated it.
  const CANCELLED_STATUSES = new Set(['CANCELLED', 'CANCELLED_BY_TRAVELER', 'CANCELLED_BY_OWNER']);

  let filtered: RawLead[];
  if (status === 'confirmed') {
    filtered = allLeads.filter(
      (l) => l.type === 'BOOKING' && CONFIRMED_STATUSES.has(l.status ?? ''),
    );
  } else if (status === 'cancelled') {
    filtered = allLeads.filter((l) => CANCELLED_STATUSES.has(l.status ?? ''));
  } else if (status === 'inquiry') {
    filtered = allLeads.filter((l) => l.type === 'INQUIRY');
  } else {
    // Exclude only calendar blocks — include BOOKING, INQUIRY, BOOKING_REQUEST, etc.
    // Airbnb and other OTAs may surface real stays as INQUIRY type, not just BOOKING.
    filtered = allLeads.filter((l) => l.type !== 'BLOCK');
  }

  const results: ReservationSummary[] = filtered.map((lead) => {
    const gi = lead.guestInformation;
    return {
      uid: lead.uid,
      propertyUid: lead.propertyUid ?? null,
      guestName: formatGuestName(gi),
      checkIn: lead.checkInLocalDateTime ?? null,
      checkOut: lead.checkOutLocalDateTime ?? null,
      channel: lead.channel ?? null,
      numberOfGuests: (gi?.adultCount ?? 0) + (gi?.childrenCount ?? 0),
      status: lead.status ?? null,
    };
  });

  process.stdout.write(JSON.stringify(results) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
