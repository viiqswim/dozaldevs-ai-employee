import { googleFetch, requireEnv } from './google-fetch.js';
import { unescapeShellArg } from '../lib/unescape-args.js';

type CreateDocumentApiResponse = {
  documentId?: string;
  title?: string;
};

function parseArgs(argv: string[]): { title: string; content: string; help: boolean } {
  const args = argv.slice(2);
  let title = '';
  let content = '';
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--title' && args[i + 1]) {
      title = args[++i];
    } else if (args[i] === '--content' && args[i + 1]) {
      content = unescapeShellArg(args[++i]);
    } else if (args[i] === '--help') {
      help = true;
    }
  }

  return { title, content, help };
}

async function main(): Promise<void> {
  const { title, content, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx create-document.ts --title <string> [--content <string>]\n\n' +
        'Creates a new Google Docs document, optionally with initial text content.\n\n' +
        'Options:\n' +
        '  --title <string>    (required) The title of the new document\n' +
        '  --content <string>  (optional) Initial text to insert into the document\n' +
        '  --help              Show this help message\n\n' +
        'Output: { id, title, webViewLink }\n\n' +
        'Environment variables:\n' +
        '  GOOGLE_ACCESS_TOKEN     (required) OAuth2 access token\n',
    );
    process.exit(0);
  }

  if (!title) {
    process.stderr.write('Error: --title is required\n');
    process.exit(1);
  }

  requireEnv('GOOGLE_ACCESS_TOKEN');

  const createRes = await googleFetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    process.stderr.write(`Error: Docs API create failed (${createRes.status}): ${text}\n`);
    process.exit(1);
  }

  const created = (await createRes.json()) as CreateDocumentApiResponse;
  const documentId = created.documentId;

  if (!documentId) {
    process.stderr.write('Error: Docs API did not return a documentId\n');
    process.exit(1);
  }

  if (content) {
    const batchUrl = `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`;
    const batchRes = await googleFetch(batchUrl, {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: content,
            },
          },
        ],
      }),
    });

    if (!batchRes.ok) {
      const text = await batchRes.text();
      process.stderr.write(`Error: Docs API batchUpdate failed (${batchRes.status}): ${text}\n`);
      process.exit(1);
    }
  }

  const webViewLink = `https://docs.google.com/document/d/${documentId}/edit`;

  process.stdout.write(
    JSON.stringify({
      id: documentId,
      title: created.title ?? title,
      webViewLink,
    }) + '\n',
  );
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
