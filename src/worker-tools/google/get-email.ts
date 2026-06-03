import { googleFetch, requireEnv } from './google-fetch.js';

type MessageHeader = {
  name: string;
  value: string;
};

type MessagePart = {
  mimeType?: string;
  body?: {
    data?: string;
    size?: number;
  };
  parts?: MessagePart[];
};

type FullMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: {
    mimeType?: string;
    headers?: MessageHeader[];
    body?: {
      data?: string;
      size?: number;
    };
    parts?: MessagePart[];
  };
};

function parseArgs(argv: string[]): { messageId: string; help: boolean } {
  const args = argv.slice(2);
  let messageId = '';
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--message-id' && args[i + 1]) {
      messageId = args[++i];
    } else if (args[i] === '--help') {
      help = true;
    }
  }

  return { messageId, help };
}

function findHeader(headers: MessageHeader[], name: string): string | null {
  const lower = name.toLowerCase();
  const header = headers.find((h) => h.name.toLowerCase() === lower);
  return header?.value ?? null;
}

function extractPlainText(part: MessagePart): string | null {
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return Buffer.from(part.body.data, 'base64url').toString('utf-8');
  }

  if (part.parts) {
    for (const subpart of part.parts) {
      const text = extractPlainText(subpart);
      if (text !== null) return text;
    }
  }

  return null;
}

async function main(): Promise<void> {
  const { messageId, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx get-email.ts --message-id <string>\n\n' +
        'Fetches a single Gmail message with full body content.\n\n' +
        'Options:\n' +
        '  --message-id <string>  (required) Gmail message ID\n' +
        '  --help                 Show this help message\n\n' +
        'Output: { id, threadId, subject, from, to, date, body, labels, snippet }\n\n' +
        'Environment variables:\n' +
        '  GOOGLE_ACCESS_TOKEN    (required) OAuth2 access token\n',
    );
    process.exit(0);
  }

  if (!messageId) {
    process.stderr.write('Error: --message-id is required\n');
    process.exit(1);
  }

  requireEnv('GOOGLE_ACCESS_TOKEN');

  const url =
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}` +
    `?format=full`;
  const res = await googleFetch(url);

  if (!res.ok) {
    const errBody = await res.text();
    process.stderr.write(`Error: Gmail get message failed (${res.status}): ${errBody}\n`);
    process.exit(1);
  }

  const message = (await res.json()) as FullMessage;
  const headers = message.payload?.headers ?? [];

  let body: string | null = null;

  if (message.payload?.body?.data) {
    body = Buffer.from(message.payload.body.data, 'base64url').toString('utf-8');
  } else if (message.payload?.parts) {
    for (const part of message.payload.parts) {
      const text = extractPlainText(part);
      if (text !== null) {
        body = text;
        break;
      }
    }
  }

  process.stdout.write(
    JSON.stringify({
      id: message.id,
      threadId: message.threadId,
      subject: findHeader(headers, 'Subject'),
      from: findHeader(headers, 'From'),
      to: findHeader(headers, 'To'),
      date: findHeader(headers, 'Date'),
      body,
      labels: message.labelIds ?? [],
      snippet: message.snippet ?? null,
    }) + '\n',
  );
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
