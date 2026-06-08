import { resolveNotionAuth } from './auth.js';
import { NOTION_API_VERSION } from '../../lib/notion-types.js';
import { unescapeShellArg } from '../lib/unescape-args.js';
import { getArg } from '../lib/get-arg.js';
import { optionalEnv } from '../lib/require-env.js';

function parseArgs(argv: string[]): {
  blockId: string;
  content: string;
  help: boolean;
} {
  const args = argv.slice(2);
  const contentRaw = getArg(args, '--content');
  return {
    blockId: getArg(args, '--block-id') ?? '',
    content: contentRaw !== undefined ? unescapeShellArg(contentRaw) : '',
    help: args.includes('--help'),
  };
}

async function main(): Promise<void> {
  const { blockId, content, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx update-block.ts --block-id <BLOCK_ID> --content "<new text>"\n\n' +
        'Updates the text content of an existing Notion paragraph block.\n\n' +
        'Options:\n' +
        '  --block-id <BLOCK_ID>  The Notion block ID to update [required]\n' +
        '  --content "<text>"     The new text content for the block [required]\n' +
        '  --help                 Show this help message\n\n' +
        'Output: JSON object with success (boolean), blockId (string)\n\n' +
        'Environment variables (one auth mode required):\n' +
        '  OAuth:   NOTION_ACCESS_TOKEN\n' +
        '  API Key: NOTION_API_KEY\n',
    );
    process.exit(0);
  }

  if (optionalEnv('NOTION_MOCK') === 'true') {
    const id = blockId || 'unknown';
    process.stdout.write(JSON.stringify({ success: true, blockId: id }) + '\n');
    process.exit(0);
  }

  if (!blockId) {
    process.stderr.write('Error: --block-id is required\n');
    process.exit(1);
  }

  if (!content) {
    process.stderr.write('Error: --content is required\n');
    process.exit(1);
  }

  const { headers } = resolveNotionAuth();

  const url = `https://api.notion.com/v1/blocks/${encodeURIComponent(blockId)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      ...headers,
      'Notion-Version': NOTION_API_VERSION,
    },
    body: JSON.stringify({
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: { content },
          },
        ],
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    process.stderr.write(
      `Error: Failed to update block ${blockId}: ${res.status} ${res.statusText}\n${body}\n`,
    );
    process.exit(1);
  }

  const data = (await res.json()) as { id: string };
  process.stdout.write(JSON.stringify({ success: true, blockId: data.id }) + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`Fatal: ${String(err)}\n`);
    process.exit(1);
  });
}
