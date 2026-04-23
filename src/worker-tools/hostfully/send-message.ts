/**
 * Sends a message to a guest via the Hostfully unified inbox API.
 *
 * DOMAIN MODEL — Hostfully uses a two-layer messaging model:
 *   Lead (reservation) ──1:1──▶ Thread ──1:N──▶ Messages
 *
 * A lead (reservation) UID is required to send a message. Optionally, a thread UID
 * can be provided to reply within a specific conversation thread.
 *
 * IMPORTANT — IRREVERSIBILITY WARNING:
 *   Messages sent through this tool are delivered immediately to the guest via the
 *   booking channel (Airbnb, VRBO, Booking.com, etc.). They CANNOT be recalled or
 *   deleted once sent. Double-check the message content and lead UID before sending.
 *   Sending to the wrong lead or with incorrect content cannot be undone.
 *
 * API DETAILS:
 *   Endpoint: POST /messages
 *   Request body:
 *     {
 *       type: 'DIRECT_MESSAGE',
 *       leadUid: string,          // required — the reservation/lead UID
 *       threadUid?: string,       // optional — include only if replying to a specific thread
 *       content: { text: string } // the message text
 *     }
 *   Response fields: uid, leadUid, threadUid, senderType, createdUtcDateTime, createdAt
 *   A 204 response (empty body) is also valid success.
 *
 * SENDER: All messages sent via this tool have senderType: AGENCY (host/agency side).
 *   The guest will see the message as coming from the property manager.
 */

type RawCreatedMessage = {
  uid?: string;
  leadUid?: string;
  threadUid?: string;
  senderType?: string;
  createdUtcDateTime?: string;
  createdAt?: string;
};

type SendResult = {
  sent: boolean;
  messageId: string | null;
  timestamp: string | null;
};

function parseArgs(argv: string[]): {
  leadId: string;
  threadId: string;
  message: string;
  help: boolean;
} {
  const args = argv.slice(2);
  let leadId = '';
  let threadId = '';
  let message = '';
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--lead-id' && args[i + 1]) {
      leadId = args[++i];
    } else if (args[i] === '--thread-id' && args[i + 1]) {
      threadId = args[++i];
    } else if (args[i] === '--message' && args[i + 1]) {
      message = args[++i];
    } else if (args[i] === '--help') {
      help = true;
    }
  }

  return { leadId, threadId, message, help };
}

async function main(): Promise<void> {
  const { leadId, threadId, message, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: node send-message.js --lead-id <uid> --message <text> [--thread-id <uid>]\n\n' +
        'Sends a message to a guest via the Hostfully unified inbox API.\n' +
        'Messages are delivered immediately to the guest through their booking channel\n' +
        '(Airbnb, VRBO, Booking.com, etc.).\n\n' +
        'WARNING — IRREVERSIBLE ACTION:\n' +
        '  Messages sent through this tool cannot be recalled or deleted once sent.\n' +
        '  They are delivered immediately to the guest. Verify the lead UID and message\n' +
        '  content before sending. This action is irreversible.\n\n' +
        'Options:\n' +
        '  --lead-id <uid>      (required) The Hostfully lead/reservation UID. The message\n' +
        '                       will be sent to the guest associated with this reservation.\n' +
        '  --thread-id <uid>    (optional) The Hostfully thread UID. When provided, the\n' +
        '                       message is sent as a reply within that specific thread.\n' +
        '                       When omitted, a new thread may be created by the API.\n' +
        '  --message <text>     (required) The message text to send to the guest.\n' +
        '  --help               Show this help message\n\n' +
        'Output on success (JSON, stdout):\n' +
        '  {\n' +
        '    "sent": true,\n' +
        '    "messageId": "uuid",          \u2014 the UID of the created message (or null)\n' +
        '    "timestamp": "2026-04-22T...", \u2014 ISO 8601 UTC creation timestamp (or null)\n' +
        '  }\n\n' +
        'Output on failure: non-zero exit code + descriptive message to stderr.\n\n' +
        'SENDER: All messages sent via this tool have senderType AGENCY (host/agency side).\n\n' +
        'Environment variables:\n' +
        '  HOSTFULLY_API_KEY    (required) Hostfully API key\n' +
        '  HOSTFULLY_API_URL    (optional) Base API URL (default: https://api.hostfully.com/api/v3.2)\n',
    );
    process.exit(0);
  }

  if (!leadId) {
    process.stderr.write('Error: --lead-id argument is required\n');
    process.exit(1);
  }

  if (!message) {
    process.stderr.write('Error: --message argument is required\n');
    process.exit(1);
  }

  const apiKey = process.env['HOSTFULLY_API_KEY'];
  if (!apiKey) {
    process.stderr.write('Error: HOSTFULLY_API_KEY environment variable is required\n');
    process.exit(1);
  }

  const baseUrl = process.env['HOSTFULLY_API_URL'] ?? 'https://api.hostfully.com/api/v3.2';

  const headers = {
    'X-HOSTFULLY-APIKEY': apiKey,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  const body: Record<string, unknown> = {
    type: 'DIRECT_MESSAGE',
    leadUid: leadId,
    content: { text: message },
  };

  if (threadId) {
    body['threadUid'] = threadId;
  }

  const res = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    process.stderr.write(`Error: Failed to send message: ${res.status}\n`);
    process.exit(1);
  }

  const text = await res.text();
  const json: RawCreatedMessage = text.length > 0 ? (JSON.parse(text) as RawCreatedMessage) : {};

  const result: SendResult = {
    sent: true,
    messageId: json.uid ?? null,
    timestamp: json.createdUtcDateTime ?? json.createdAt ?? null,
  };

  process.stdout.write(JSON.stringify(result) + '\n');
}

main().catch((err) => {
  process.stderr.write('Fatal: ' + String(err) + '\n');
  process.exit(1);
});
