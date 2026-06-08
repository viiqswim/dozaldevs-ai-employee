import { resolveNotionAuth } from './auth.js';
import { NOTION_API_VERSION } from '../../lib/notion-types.js';
import { unescapeShellArg } from '../lib/unescape-args.js';
import { getArg } from '../lib/get-arg.js';
import { optionalEnv } from '../lib/require-env.js';

type BlockType = 'paragraph' | 'bulleted_list_item' | 'heading_2';

function parseArgs(argv: string[]): {
  pageId: string;
  content: string;
  type: BlockType;
  help: boolean;
} {
  const args = argv.slice(2);
  const contentRaw = getArg(args, '--content');
  const typeRaw = getArg(args, '--type');
  return {
    pageId: getArg(args, '--page-id') ?? '',
    content: contentRaw !== undefined ? unescapeShellArg(contentRaw) : '',
    type: typeRaw !== undefined ? (typeRaw as BlockType) : 'paragraph',
    help: args.includes('--help'),
  };
}

async function main(): Promise<void> {
  const { pageId, content, type, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx append-blocks.ts --page-id <PAGE_ID> --content "<text>" [--type paragraph|bulleted_list_item|heading_2]\n\n' +
        'Appends a new block to a Notion page.\n\n' +
        'Options:\n' +
        '  --page-id <PAGE_ID>  The Notion page (or block) ID to append to [required]\n' +
        '  --content "<text>"   The text content to append [required]\n' +
        '  --type <type>        Block type: paragraph (default), bulleted_list_item, heading_2\n' +
        '  --help               Show this help message\n\n' +
        'Output: JSON object with success (boolean), blocksAdded (number)\n\n' +
        'Environment variables (one auth mode required):\n' +
        '  OAuth:   NOTION_ACCESS_TOKEN\n' +
        '  API Key: NOTION_API_KEY\n',
    );
    process.exit(0);
  }

  if (optionalEnv('NOTION_MOCK') === 'true') {
    process.stdout.write(JSON.stringify({ success: true, blocksAdded: 1 }) + '\n');
    process.exit(0);
  }

  if (!pageId) {
    process.stderr.write('Error: --page-id is required\n');
    process.exit(1);
  }

  if (!content) {
    process.stderr.write('Error: --content is required\n');
    process.exit(1);
  }

  const { headers } = resolveNotionAuth();

  const blockChild = {
    object: 'block',
    type,
    [type]: {
      rich_text: [
        {
          type: 'text',
          text: { content },
        },
      ],
    },
  };

  const url = `https://api.notion.com/v1/blocks/${encodeURIComponent(pageId)}/children`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      ...headers,
      'Notion-Version': NOTION_API_VERSION,
    },
    body: JSON.stringify({ children: [blockChild] }),
  });

  if (!res.ok) {
    const body = await res.text();
    process.stderr.write(
      `Error: Failed to append blocks: ${res.status} ${res.statusText}\n${body}\n`,
    );
    process.exit(1);
  }

  const data = (await res.json()) as { results: unknown[] };
  process.stdout.write(JSON.stringify({ success: true, blocksAdded: data.results.length }) + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`Fatal: ${String(err)}\n`);
    process.exit(1);
  });
}
