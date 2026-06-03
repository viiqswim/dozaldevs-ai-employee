import { googleFetch, requireEnv } from './google-fetch.js';

type MessageListItem = {
  id: string;
  threadId: string;
};

type MessageListResponse = {
  messages?: MessageListItem[];
  resultSizeEstimate?: number;
};

type MessageHeader = {
  name: string;
  value: string;
};

type MessageMetadata = {
  id: string;
  threadId: string;
  snippet?: string;
  payload?: {
    headers?: MessageHeader[];
  };
};

type EmailSummary = {
  id: string;
  threadId: string;
  subject: string | null;
  from: string | null;
  date: string | null;
  snippet: string | null;
};

function parseArgs(argv: string[]): { query: string; maxResults: number; help: boolean } {
  const args = argv.slice(2);
  let query = 'is:unread';
  let maxResults = 10;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--query' && args[i + 1]) {
      query = args[++i];
    } else if (args[i] === '--max-results' && args[i + 1]) {
      maxResults = parseInt(args[++i], 10);
    } else if (args[i] === '--help') {
      help = true;
    }
  }

  return { query, maxResults, help };
}

function findHeader(headers: MessageHeader[], name: string): string | null {
  const lower = name.toLowerCase();
  const header = headers.find((h) => h.name.toLowerCase() === lower);
  return header?.value ?? null;
}

async function main(): Promise<void> {
  const { query, maxResults, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx list-emails.ts [--query <string>] [--max-results <number>]\n\n' +
        'Lists Gmail messages matching the given search query.\n\n' +
        'Options:\n' +
        '  --query <string>       Gmail search query (default: "is:unread")\n' +
        '  --max-results <number> Maximum number of messages to return (default: 10)\n' +
        '  --help                 Show this help message\n\n' +
        'Output: { messages: [{ id, threadId, subject, from, date, snippet }], resultSizeEstimate }\n\n' +
        'Environment variables:\n' +
        '  GOOGLE_ACCESS_TOKEN    (required) OAuth2 access token\n',
    );
    process.exit(0);
  }

  requireEnv('GOOGLE_ACCESS_TOKEN');

  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${encodeURIComponent(String(maxResults))}`;
  const listRes = await googleFetch(listUrl);

  if (!listRes.ok) {
    const body = await listRes.text();
    process.stderr.write(`Error: Gmail list messages failed (${listRes.status}): ${body}\n`);
    process.exit(1);
  }

  const listJson = (await listRes.json()) as MessageListResponse;
  const messageItems = listJson.messages ?? [];

  if (messageItems.length === 0) {
    process.stdout.write(JSON.stringify({ messages: [], resultSizeEstimate: 0 }) + '\n');
    return;
  }

  const messages: EmailSummary[] = await Promise.all(
    messageItems.map(async (item) => {
      const metaUrl =
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}` +
        `?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`;
      const metaRes = await googleFetch(metaUrl);

      if (!metaRes.ok) {
        process.stderr.write(
          `Warning: Failed to fetch metadata for message ${item.id}: ${metaRes.status}\n`,
        );
        return {
          id: item.id,
          threadId: item.threadId,
          subject: null,
          from: null,
          date: null,
          snippet: null,
        };
      }

      const meta = (await metaRes.json()) as MessageMetadata;
      const headers = meta.payload?.headers ?? [];

      return {
        id: item.id,
        threadId: item.threadId,
        subject: findHeader(headers, 'Subject'),
        from: findHeader(headers, 'From'),
        date: findHeader(headers, 'Date'),
        snippet: meta.snippet ?? null,
      };
    }),
  );

  process.stdout.write(
    JSON.stringify({
      messages,
      resultSizeEstimate: listJson.resultSizeEstimate ?? messages.length,
    }) + '\n',
  );
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
