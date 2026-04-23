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
 * DEFAULT FILTER: Only BOOKING-type leads are returned unless --status is
 * specified. BLOCKs, INQUIRYs, and BOOKING_REQUESTs are excluded by default
 * because they do not represent actual guest stays.
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

function parseArgs(argv: string[]): {
  propertyId: string;
  status: string;
  from: string;
  to: string;
  help: boolean;
} {
  const args = argv.slice(2);
  let propertyId = '';
  let status = '';
  let from = '';
  let to = '';
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--property-id' && args[i + 1]) {
      propertyId = args[++i];
    } else if (args[i] === '--status' && args[i + 1]) {
      status = args[++i];
    } else if (args[i] === '--from' && args[i + 1]) {
      from = args[++i];
    } else if (args[i] === '--to' && args[i + 1]) {
      to = args[++i];
    } else if (args[i] === '--help') {
      help = true;
    }
  }

  return { propertyId, status, from, to, help };
}

function formatGuestName(
  gi: { firstName?: string | null; lastName?: string | null } | undefined,
): string | null {
  if (!gi) return null;
  const parts = [gi.firstName, gi.lastName].filter(
    (p): p is string => typeof p === 'string' && p !== '',
  );
  return parts.length > 0 ? parts.join(' ').trim() : null;
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
        '                       Without --status, only confirmed bookings (BOOKING type) are returned.\n' +
        '                       Calendar blocks and pending requests are always excluded.\n' +
        '  --from <date>        Filter by check-in from date (YYYY-MM-DD)\n' +
        '  --to <date>          Filter by check-in to date (YYYY-MM-DD)\n' +
        '                       Without --from/--to, only current and future reservations are shown.\n' +
        '  --help               Show this help message\n\n' +
        'Environment variables:\n' +
        '  HOSTFULLY_API_KEY    (required) Hostfully API key\n' +
        '  HOSTFULLY_API_URL    (optional) Base API URL (default: https://api.hostfully.com/api/v3.2)\n',
    );
    process.exit(0);
  }

  if (!propertyId) {
    process.stderr.write('Error: --property-id argument is required\n');
    process.exit(1);
  }

  const apiKey = process.env['HOSTFULLY_API_KEY'];
  if (!apiKey) {
    process.stderr.write('Error: HOSTFULLY_API_KEY environment variable is required\n');
    process.exit(1);
  }

  const baseUrl = process.env['HOSTFULLY_API_URL'] ?? 'https://api.hostfully.com/api/v3.2';

  const headers = { 'X-HOSTFULLY-APIKEY': apiKey, Accept: 'application/json' };

  let queryBase = `${baseUrl}/leads?propertyUid=${encodeURIComponent(propertyId)}`;

  if (from) {
    queryBase += `&checkInFrom=${encodeURIComponent(from)}`;
  }
  if (to) {
    queryBase += `&checkInTo=${encodeURIComponent(to)}`;
  }
  // Default to today as checkInFrom so we don't fetch the entire booking history.
  // Past reservations are rarely useful and the full history can be very large.
  if (!from && !to) {
    queryBase += `&checkInFrom=${new Date().toISOString().slice(0, 10)}`;
  }

  const seenUids = new Set<string>();
  const allLeads: RawLead[] = [];
  let cursor: string | undefined = undefined;

  do {
    const url = cursor ? `${queryBase}&_cursor=${encodeURIComponent(cursor)}` : queryBase;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      process.stderr.write(`Error: Failed to fetch reservations: ${res.status}\n`);
      process.exit(1);
    }

    const json = (await res.json()) as {
      leads?: RawLead[];
      _paging?: { _nextCursor?: string };
    };

    const page = json.leads ?? [];
    let hasNew = false;
    for (const lead of page) {
      if (lead.uid && !seenUids.has(lead.uid)) {
        seenUids.add(lead.uid);
        allLeads.push(lead);
        hasNew = true;
      }
    }

    cursor = json._paging?._nextCursor;
    if (!hasNew || !cursor) break;
  } while (true);

  // CONFIRMED_STATUSES: active/upcoming bookings a guest will actually show up for.
  //   BOOKED / BOOKED_BY_AGENT / BOOKED_BY_CUSTOMER / BOOKED_EXTERNALLY — reservation confirmed
  //   STAY — guest is currently checked in
  const CONFIRMED_STATUSES = new Set([
    'BOOKED',
    'BOOKED_BY_AGENT',
    'BOOKED_BY_CUSTOMER',
    'BOOKED_EXTERNALLY',
    'STAY',
  ]);
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
    filtered = allLeads.filter((l) => l.type === 'BOOKING');
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
