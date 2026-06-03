import { googleFetch, requireEnv } from './google-fetch.js';

type TextRun = {
  content?: string;
};

type ParagraphElement = {
  textRun?: TextRun;
};

type Paragraph = {
  elements?: ParagraphElement[];
};

type StructuralElement = {
  paragraph?: Paragraph;
};

type DocumentBody = {
  content?: StructuralElement[];
};

type DocumentApiResponse = {
  documentId?: string;
  title?: string;
  body?: DocumentBody;
  revisionId?: string;
};

function parseArgs(argv: string[]): { documentId: string; help: boolean } {
  const args = argv.slice(2);
  let documentId = '';
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--document-id' && args[i + 1]) {
      documentId = args[++i];
    } else if (args[i] === '--help') {
      help = true;
    }
  }

  return { documentId, help };
}

function extractPlainText(body: DocumentBody): string {
  const parts: string[] = [];
  for (const element of body.content ?? []) {
    const para = element.paragraph;
    if (!para) continue;
    for (const el of para.elements ?? []) {
      const content = el.textRun?.content;
      if (content) parts.push(content);
    }
  }
  return parts.join('');
}

async function main(): Promise<void> {
  const { documentId, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx get-document.ts --document-id <id>\n\n' +
        'Fetches a Google Docs document and returns its content as plain text.\n\n' +
        'Options:\n' +
        '  --document-id <string>  (required) The Google Docs document ID\n' +
        '  --help                  Show this help message\n\n' +
        'Output: { id, title, body_text, revisionId }\n\n' +
        'Environment variables:\n' +
        '  GOOGLE_ACCESS_TOKEN     (required) OAuth2 access token\n',
    );
    process.exit(0);
  }

  if (!documentId) {
    process.stderr.write('Error: --document-id is required\n');
    process.exit(1);
  }

  requireEnv('GOOGLE_ACCESS_TOKEN');

  const url = `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`;
  const response = await googleFetch(url);

  if (!response.ok) {
    const text = await response.text();
    process.stderr.write(`Error: Docs API returned ${response.status}: ${text}\n`);
    process.exit(1);
  }

  const doc = (await response.json()) as DocumentApiResponse;
  const bodyText = doc.body ? extractPlainText(doc.body) : '';

  process.stdout.write(
    JSON.stringify({
      id: doc.documentId ?? documentId,
      title: doc.title ?? '',
      body_text: bodyText,
      revisionId: doc.revisionId ?? null,
    }) + '\n',
  );
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
