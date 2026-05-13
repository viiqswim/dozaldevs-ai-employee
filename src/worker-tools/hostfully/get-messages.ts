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
  checkInLocalDateTime?: string | null;
  checkOutLocalDateTime?: string | null;
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
  leadUid: string;
  threadUid: string;
  propertyUid: string | null;
  guestName: string | null;
  channel: string | null;
  checkIn: string | null;
  checkOut: string | null;
  leadStatus: string | null;
  unresponded: boolean;
  messages: MessageSummary[];
};

function parseArgs(argv: string[]): {
  propertyId: string;
  leadId: string;
  unrespondedOnly: boolean;
  limit: number;
  help: boolean;
  fallbackPropertyUid: string;
} {
  const args = argv.slice(2);
  let propertyId = '';
  let leadId = '';
  let unrespondedOnly = false;
  let limit = 30;
  let help = false;
  let fallbackPropertyUid = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--property-id' && args[i + 1]) {
      propertyId = args[++i];
    } else if (args[i] === '--lead-id' && args[i + 1]) {
      leadId = args[++i];
    } else if (args[i] === '--unresponded-only') {
      unrespondedOnly = true;
    } else if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[++i], 10);
    } else if (args[i] === '--fallback-property-uid' && args[i + 1]) {
      fallbackPropertyUid = args[++i];
    } else if (args[i] === '--help') {
      help = true;
    }
  }

  return { propertyId, leadId, unrespondedOnly, limit, help, fallbackPropertyUid };
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
  const parsed = parseArgs(process.argv);
  const { propertyId, unrespondedOnly, limit, help, fallbackPropertyUid } = parsed;
  let leadId = parsed.leadId;

  // LEAD_UID env var fallback: if --lead-id was not provided but LEAD_UID is set,
  // auto-use it (lifecycle injects LEAD_UID from webhook raw_event).
  if (!leadId && process.env['LEAD_UID']) {
    process.stderr.write(
      `[get-messages] WARNING: --lead-id not provided, falling back to LEAD_UID env var: ${process.env['LEAD_UID']}\n`,
    );
    leadId = process.env['LEAD_UID'];
  }

  if (help) {
    process.stdout.write(
      'Usage: node get-messages.js [--lead-id <uid> | --property-id <uid>] [--unresponded-only] [--limit <n>] [--fallback-property-uid <uid>]\n\n' +
        'Fetches guest message threads for a Hostfully property from the unified inbox.\n' +
        'Note: Hostfully aggregates messages from all booking channels (Airbnb, VRBO, etc.)\n' +
        'into a unified inbox. This tool fetches conversations for all active reservations.\n\n' +
        'Options:\n' +
        '  --lead-id <uid>        Fetch messages for a single lead/reservation thread.\n' +
        '                         Mutually exclusive with --property-id.\n' +
        '  --property-id <uid>    (optional) Property UID to fetch messages for.\n' +
        '                         If omitted, fetches messages across all properties using\n' +
        '                         the HOSTFULLY_AGENCY_UID environment variable.\n' +
        '                         Mutually exclusive with --lead-id.\n' +
        '  --unresponded-only     Filter to threads where the last message is from the guest\n' +
        '                         (host has not yet replied). Useful for identifying conversations\n' +
        '                         that need attention.\n' +
        '  --limit <n>            Max messages to fetch per conversation thread (default: 30)\n' +
        '  --fallback-property-uid <uid>\n' +
        '                         Property UID to use when the Hostfully API returns null for propertyUid\n' +
        '                         on the lead. INQUIRY-type leads often have no propertyUid assigned yet.\n' +
        "                         The webhook payload's property_uid is the authoritative fallback source.\n" +
        '  --help                 Show this help message\n\n' +
        'Output: JSON array of conversation threads. Each thread:\n' +
        '  {\n' +
        '    "leadUid": "uuid",              \u2014 the lead/reservation ID\n' +
        '    "threadUid": "uuid",            \u2014 the Hostfully thread UID (from THREAD_UID env var)\n' +
        '    "propertyUid": "uuid",          \u2014 the property UID (use with get-property.ts)\n' +
        '    "guestName": "John Doe",        \u2014 guest\'s full name (or null)\n' +
        '    "channel": "AIRBNB",            \u2014 booking channel\n' +
        '    "checkIn": "2026-05-01T15:00:00",  \u2014 check-in date/time (or null)\n' +
        '    "checkOut": "2026-05-05T11:00:00", \u2014 check-out date/time (or null)\n' +
        '    "leadStatus": "BOOKED",         \u2014 lead status from Hostfully (or null)\n' +
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
        '  HOSTFULLY_API_KEY      (required) Hostfully API key\n' +
        '  HOSTFULLY_AGENCY_UID   (required when --property-id is omitted) Agency UID for listing all properties\n' +
        '  HOSTFULLY_API_URL      (optional) Base API URL (default: https://api.hostfully.com/api/v3.2)\n',
    );
    process.exit(0);
  }

  if (leadId && propertyId) {
    process.stderr.write('Error: --lead-id and --property-id are mutually exclusive\n');
    process.exit(1);
  }

  // HOSTFULLY_MOCK: return fixture data instead of calling the real API.
  // Set HOSTFULLY_MOCK=true in .env for local E2E testing without real Hostfully credentials.
  if (process.env['HOSTFULLY_MOCK'] === 'true') {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = dirname(fileURLToPath(import.meta.url));
    let fixturePath = join(__dirname, 'fixtures', 'get-messages', 'default.json');
    if (leadId) {
      const leadFixture = join(__dirname, 'fixtures', 'get-messages', `${leadId}.json`);
      try {
        readFileSync(leadFixture);
        fixturePath = leadFixture;
      } catch {
        // fall back to default
      }
    }
    const fixtureData = readFileSync(fixturePath, 'utf8');
    process.stdout.write(fixtureData.trimEnd() + '\n');
    return;
  }

  const agencyUid = process.env['HOSTFULLY_AGENCY_UID'] ?? '';

  if (!leadId && !propertyId && !agencyUid) {
    process.stderr.write(
      'Error: either --lead-id or --property-id argument or HOSTFULLY_AGENCY_UID environment variable is required\n',
    );
    process.exit(1);
  }

  const apiKey = process.env['HOSTFULLY_API_KEY'];
  if (!apiKey) {
    process.stderr.write('Error: HOSTFULLY_API_KEY environment variable is required\n');
    process.exit(1);
  }

  const baseUrl = process.env['HOSTFULLY_API_URL'] ?? 'https://api.hostfully.com/api/v3.2';

  const headers = { 'X-HOSTFULLY-APIKEY': apiKey, Accept: 'application/json' };

  // --- Single-lead path (--lead-id or LEAD_UID fallback) ---
  if (leadId) {
    if (unrespondedOnly) {
      process.stderr.write(
        `[get-messages] WARNING: --unresponded-only is ignored when --lead-id is set — returning full conversation for lead ${leadId}\n`,
      );
    }
    const leadRes = await fetch(`${baseUrl}/leads/${encodeURIComponent(leadId)}`, { headers });
    if (!leadRes.ok) {
      process.stderr.write(`Error: Failed to fetch lead ${leadId}: ${leadRes.status}\n`);
      process.exit(1);
    }
    const leadJson = (await leadRes.json()) as { lead?: RawLead };
    const lead = leadJson.lead ?? (leadJson as unknown as RawLead);

    const messagesUrl = `${baseUrl}/messages?leadUid=${encodeURIComponent(leadId)}&_limit=${encodeURIComponent(String(limit))}`;
    const msgRes = await fetch(messagesUrl, { headers });
    if (!msgRes.ok) {
      process.stderr.write(
        `Error: Failed to fetch messages for lead ${leadId}: ${msgRes.status}\n`,
      );
      process.exit(1);
    }
    const msgJson = (await msgRes.json()) as { messages?: RawMessage[] };
    const rawMessages = msgJson.messages ?? [];

    const threads: ThreadSummary[] = [];

    if (rawMessages.length > 0) {
      const sorted = [...rawMessages].sort((a, b) =>
        (a.createdUtcDateTime ?? '').localeCompare(b.createdUtcDateTime ?? ''),
      );
      const lastMessage = sorted[sorted.length - 1];
      const unresponded = !!lastMessage?.senderType && lastMessage.senderType !== 'AGENCY';
      process.stderr.write(
        `[get-messages] lead=${leadId}: ${rawMessages.length} messages, lastMessage.senderType="${lastMessage?.senderType ?? 'undefined'}", unresponded=${unresponded}\n`,
      );

      const messages: MessageSummary[] = sorted.map((m) => ({
        text: m.content?.text ?? null,
        sender: m.senderType === 'AGENCY' ? 'host' : m.senderType ? 'guest' : null,
        timestamp: m.createdUtcDateTime ?? null,
      }));

      const resolvedPropertyUid = lead.propertyUid ?? (fallbackPropertyUid || null);
      if (!lead.propertyUid && fallbackPropertyUid) {
        process.stderr.write(
          `[get-messages] lead=${leadId}: propertyUid is null — using --fallback-property-uid ${fallbackPropertyUid}\n`,
        );
      }
      threads.push({
        leadUid: lead.uid,
        threadUid: process.env['THREAD_UID'] ?? '',
        propertyUid: resolvedPropertyUid,
        guestName: formatGuestName(lead.guestInformation),
        channel: lead.channel ?? null,
        checkIn: lead.checkInLocalDateTime ?? null,
        checkOut: lead.checkOutLocalDateTime ?? null,
        leadStatus: lead.status ?? null,
        unresponded,
        messages,
      });
    }

    process.stdout.write(JSON.stringify(threads) + '\n');
    return;
  }

  // Fetch leads: last 30 days and upcoming
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const queryBase = propertyId
    ? `${baseUrl}/leads?propertyUid=${encodeURIComponent(propertyId)}&checkInFrom=${thirtyDaysAgo}`
    : `${baseUrl}/leads?agencyUid=${encodeURIComponent(agencyUid)}&checkInFrom=${thirtyDaysAgo}`;

  // Cursor-dedup pagination loop (same pattern as get-reservations.ts)
  const seenUids = new Set<string>();
  const allLeads: RawLead[] = [];
  let cursor: string | undefined = undefined;

  for (;;) {
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
  }

  // Exclude calendar blocks only — include BOOKING, INQUIRY, BOOKING_REQUEST, etc.
  // Airbnb and other OTAs may surface real stays as INQUIRY type, not just BOOKING.
  const eligibleLeads = allLeads.filter((l) => l.type !== 'BLOCK');

  const threads: ThreadSummary[] = [];

  for (const lead of eligibleLeads) {
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
    const unresponded = !!lastMessage?.senderType && lastMessage.senderType !== 'AGENCY';
    process.stderr.write(
      `[get-messages] lead=${lead.uid}: ${rawMessages.length} messages, lastMessage.senderType="${lastMessage?.senderType ?? 'undefined'}", unresponded=${unresponded}\n`,
    );

    const messages: MessageSummary[] = sorted.map((m) => ({
      text: m.content?.text ?? null,
      sender: m.senderType === 'AGENCY' ? 'host' : m.senderType ? 'guest' : null,
      timestamp: m.createdUtcDateTime ?? null,
    }));

    const resolvedPropertyUid = lead.propertyUid ?? (fallbackPropertyUid || null);
    if (!lead.propertyUid && fallbackPropertyUid) {
      process.stderr.write(
        `[get-messages] lead=${lead.uid}: propertyUid is null — using --fallback-property-uid ${fallbackPropertyUid}\n`,
      );
    }
    threads.push({
      leadUid: lead.uid,
      threadUid: process.env['THREAD_UID'] ?? '',
      propertyUid: resolvedPropertyUid,
      guestName: formatGuestName(lead.guestInformation),
      channel: lead.channel ?? null,
      checkIn: lead.checkInLocalDateTime ?? null,
      checkOut: lead.checkOutLocalDateTime ?? null,
      leadStatus: lead.status ?? null,
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
