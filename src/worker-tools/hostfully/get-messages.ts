/**
 * Fetches guest message threads for a Hostfully property.
 *
 * DOMAIN MODEL — Hostfully uses a two-layer messaging model:
 *   Lead (reservation) ──1:1──▶ Thread ──1:N──▶ Messages
 *
 * This tool does a two-step fetch:
 *   1. GET /leads?propertyUid={uid}  — fetch BOOKING-type leads for the property
 *   2. GET /messages?leadUid={uid}   — fetch messages for each lead (separate endpoint)
 *
 * UNIFIED INBOX: The `type` field on each message is the booking channel
 * (AIRBNB, VRBO, BOOKING_COM, etc.) — not the message type. Messages from all
 * OTA channels are aggregated here, making it a "unified inbox".
 *
 * SENDER DETECTION: `senderType` indicates direction — GUEST (inbound from
 * guest) or AGENCY (outbound from host/agency). There is no server-side
 * "unresponded" filter; detection requires checking if the last message has
 * senderType GUEST.
 *
 * CLIENT-SIDE FILTERING: --unresponded-only filters threads where the
 * chronologically last message has senderType === 'GUEST', meaning the host
 * has not yet replied.
 *
 * CONFIRMED LIVE API (2026-04-22):
 *   - Response envelope: { messages: [...], _metadata: {...}, _paging: { _nextCursor: "..." } }
 *   - Message fields: uid, createdUtcDateTime, status, type (channel), senderType, content.text
 *   - senderType values: "GUEST" or "AGENCY" (agency = host side)
 *   - API returns messages newest-first; we sort to chronological (oldest-first)
 */
type RawLead = {
  uid: string;
  propertyUid?: string;
  type?: string;
  status?: string;
  channel?: string;
  guestInformation?: {
    firstName?: string | null;
    lastName?: string | null;
  };
};

// Confirmed from live API (2026-04-22):
// - content is a nested object { subject: string|null, text: string }
// - senderType is "GUEST" or "AGENCY" (not "HOST")
// - timestamp field is createdUtcDateTime (ISO 8601 UTC)
type RawMessage = {
  uid: string;
  leadUid?: string;
  content?: {
    subject?: string | null;
    text?: string | null;
  };
  senderType?: string; // "GUEST" or "AGENCY"
  type?: string; // booking channel (AIRBNB, VRBO, etc.), NOT message type
  createdUtcDateTime?: string; // ISO 8601 UTC timestamp
};

type MessageSummary = {
  text: string | null;
  sender: 'guest' | 'host' | null;
  timestamp: string | null;
};

type ThreadSummary = {
  reservationId: string;
  guestName: string | null;
  channel: string | null;
  unresponded: boolean;
  messages: MessageSummary[];
};

function parseArgs(argv: string[]): {
  propertyId: string;
  unrespondedOnly: boolean;
  limit: number;
  help: boolean;
} {
  const args = argv.slice(2);
  let propertyId = '';
  let unrespondedOnly = false;
  let limit = 30;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--property-id' && args[i + 1]) {
      propertyId = args[++i];
    } else if (args[i] === '--unresponded-only') {
      unrespondedOnly = true;
    } else if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[++i], 10);
    } else if (args[i] === '--help') {
      help = true;
    }
  }

  return { propertyId, unrespondedOnly, limit, help };
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
  const { propertyId, unrespondedOnly, limit, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: node get-messages.js --property-id <uid> [--unresponded-only] [--limit <n>]\n\n' +
        'Fetches guest message threads for a Hostfully property from the unified inbox.\n' +
        'Note: Hostfully aggregates messages from all booking channels (Airbnb, VRBO, etc.)\n' +
        'into a unified inbox. This tool fetches conversations for all active reservations.\n\n' +
        'Options:\n' +
        '  --property-id <uid>    (required) Property UID to fetch messages for\n' +
        '  --unresponded-only     Filter to threads where the last message is from the guest\n' +
        '                         (host has not yet replied). Useful for identifying conversations\n' +
        '                         that need attention.\n' +
        '  --limit <n>            Max messages to fetch per conversation thread (default: 30)\n' +
        '  --help                 Show this help message\n\n' +
        'Output: JSON array of conversation threads. Each thread:\n' +
        '  {\n' +
        '    "reservationId": "uuid",        \u2014 the lead/reservation ID\n' +
        '    "guestName": "John Doe",        \u2014 guest\'s full name (or null)\n' +
        '    "channel": "AIRBNB",            \u2014 booking channel\n' +
        '    "unresponded": true,            \u2014 true if last message is from guest\n' +
        '    "messages": [\n' +
        '      {\n' +
        '        "text": "What time is check-in?",\n' +
        '        "sender": "guest",          \u2014 "guest" or "host"\n' +
        '        "timestamp": "2026-04-20T14:30:00Z"\n' +
        '      }\n' +
        '    ]\n' +
        '  }\n\n' +
        'Default behavior: returns threads for all BOOKING-type leads with check-in\n' +
        'within the last 30 days or upcoming. Excludes calendar blocks and inquiries.\n\n' +
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

  // Fetch leads: last 30 days and upcoming
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const queryBase = `${baseUrl}/leads?propertyUid=${encodeURIComponent(propertyId)}&checkInFrom=${thirtyDaysAgo}`;

  // Cursor-dedup pagination loop (same pattern as get-reservations.ts)
  const seenUids = new Set<string>();
  const allLeads: RawLead[] = [];
  let cursor: string | undefined = undefined;

  do {
    const url = cursor ? `${queryBase}&_cursor=${encodeURIComponent(cursor)}` : queryBase;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      process.stderr.write(`Error: Failed to fetch leads: ${res.status}\n`);
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

  // Filter to BOOKING-type leads only (exclude BLOCKs, INQUIRYs, BOOKING_REQUESTs)
  const bookingLeads = allLeads.filter((l) => l.type === 'BOOKING');

  const threads: ThreadSummary[] = [];

  for (const lead of bookingLeads) {
    const messagesUrl = `${baseUrl}/messages?leadUid=${encodeURIComponent(lead.uid)}&_limit=${encodeURIComponent(String(limit))}`;

    const msgRes = await fetch(messagesUrl, { headers });
    if (!msgRes.ok) {
      process.stderr.write(
        `Error: Failed to fetch messages for lead ${lead.uid}: ${msgRes.status}\n`,
      );
      process.exit(1);
    }

    const msgJson = (await msgRes.json()) as {
      messages?: RawMessage[];
    };

    const rawMessages = msgJson.messages ?? [];

    if (rawMessages.length === 0) continue;

    const sorted = [...rawMessages].sort((a, b) =>
      (a.createdUtcDateTime ?? '').localeCompare(b.createdUtcDateTime ?? ''),
    );

    const lastMessage = sorted[sorted.length - 1];
    const unresponded = lastMessage?.senderType === 'GUEST';

    const messages: MessageSummary[] = sorted.map((m) => ({
      text: m.content?.text ?? null,
      sender: m.senderType === 'GUEST' ? 'guest' : m.senderType === 'AGENCY' ? 'host' : null,
      timestamp: m.createdUtcDateTime ?? null,
    }));

    threads.push({
      reservationId: lead.uid,
      guestName: formatGuestName(lead.guestInformation),
      channel: lead.channel ?? null,
      unresponded,
      messages,
    });
  }

  const results = unrespondedOnly ? threads.filter((t) => t.unresponded) : threads;

  process.stdout.write(JSON.stringify(results) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
