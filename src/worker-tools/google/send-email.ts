import { googleFetch, requireEnv } from './google-fetch.js';
import { unescapeShellArg } from '../lib/unescape-args.js';

type SendResponse = {
  id: string;
  threadId: string;
  labelIds?: string[];
};

function parseArgs(argv: string[]): {
  to: string;
  subject: string;
  body: string;
  cc: string;
  bcc: string;
  help: boolean;
} {
  const args = argv.slice(2);
  let to = '';
  let subject = '';
  let body = '';
  let cc = '';
  let bcc = '';
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--to' && args[i + 1]) {
      to = args[++i];
    } else if (args[i] === '--subject' && args[i + 1]) {
      subject = args[++i];
    } else if (args[i] === '--body' && args[i + 1]) {
      body = unescapeShellArg(args[++i]);
    } else if (args[i] === '--cc' && args[i + 1]) {
      cc = args[++i];
    } else if (args[i] === '--bcc' && args[i + 1]) {
      bcc = args[++i];
    } else if (args[i] === '--help') {
      help = true;
    }
  }

  return { to, subject, body, cc, bcc, help };
}

function plainTextToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) =>
      para
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .join(' '),
    )
    .filter((para) => para.length > 0)
    .map((para) => `<p>${para}</p>`)
    .join('\n');
}

function buildRfc2822(to: string, subject: string, body: string, cc: string, bcc: string): string {
  const lines: string[] = ['MIME-Version: 1.0', `To: ${to}`, `Subject: ${subject}`];

  if (cc) lines.push(`Cc: ${cc}`);
  if (bcc) lines.push(`Bcc: ${bcc}`);

  lines.push('Content-Type: text/html; charset=utf-8');
  lines.push('');

  const hasHtmlTags = /<[a-z][\s\S]*?>/i.test(body);
  lines.push(hasHtmlTags ? body : plainTextToHtml(body));

  return lines.join('\r\n');
}

async function main(): Promise<void> {
  const { to, subject, body, cc, bcc, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx send-email.ts --to <string> --subject <string> --body <string> [--cc <string>] [--bcc <string>]\n\n' +
        'Sends an email via the Gmail API.\n\n' +
        'Options:\n' +
        '  --to <string>       (required) Recipient email address\n' +
        '  --subject <string>  (required) Email subject line\n' +
        '  --body <string>     (required) Email body. Plain text: use \\n\\n between paragraphs — hard-wrapped lines are auto-reflowed. HTML: pass tags directly for rich formatting (bold, links, etc.).\n' +
        '  --cc <string>       (optional) CC recipient email address\n' +
        '  --bcc <string>      (optional) BCC recipient email address\n' +
        '  --help              Show this help message\n\n' +
        'Output: { id, threadId, labelIds }\n\n' +
        'Environment variables:\n' +
        '  GOOGLE_ACCESS_TOKEN    (required) OAuth2 access token\n',
    );
    process.exit(0);
  }

  if (!to) {
    process.stderr.write('Error: --to is required\n');
    process.exit(1);
  }

  if (!subject) {
    process.stderr.write('Error: --subject is required\n');
    process.exit(1);
  }

  if (!body) {
    process.stderr.write('Error: --body is required\n');
    process.exit(1);
  }

  requireEnv('GOOGLE_ACCESS_TOKEN');

  const rfcMessage = buildRfc2822(to, subject, body, cc, bcc);
  const raw = Buffer.from(rfcMessage).toString('base64url');

  const res = await googleFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    process.stderr.write(`Error: Gmail send message failed (${res.status}): ${errBody}\n`);
    process.exit(1);
  }

  const sent = (await res.json()) as SendResponse;

  process.stdout.write(
    JSON.stringify({
      id: sent.id,
      threadId: sent.threadId,
      labelIds: sent.labelIds ?? [],
    }) + '\n',
  );
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
