import { NOTION_API_VERSION } from '../lib/notion-types.js';

type RichTextItem = {
  plain_text?: string;
};

type Block = {
  object: string;
  id: string;
  type: string;
  has_children: boolean;
  in_trash?: boolean;
  [key: string]: unknown;
};

type BlocksResponse = {
  object: string;
  results: Block[];
  has_more: boolean;
  next_cursor: string | null;
};

type PageOutput =
  | {
      success: true;
      pageId: string;
      content: string;
      blockCount: number;
    }
  | {
      success: false;
      error: string;
    };

function extractBlockText(block: Block): string {
  const type = block.type;

  // synced_block is not supported: resolving the original block requires a separate
  // API lookup by synced_from.block_id, which is outside the scope of this tool.
  if (type === 'synced_block') return '';

  const blockData = block[type] as { rich_text?: RichTextItem[] } | undefined;
  if (!blockData?.rich_text) return '';

  // Always use plain_text — never text.content (which is truncated and may not exist)
  return blockData.rich_text.map((rt) => rt.plain_text ?? '').join('');
}

async function fetchBlocksRecursive(
  blockId: string,
  headers: Record<string, string>,
  depth: number,
): Promise<{ texts: string[]; count: number }> {
  if (depth >= 3) return { texts: [], count: 0 };

  const texts: string[] = [];
  let count = 0;
  let cursor: string | undefined;

  do {
    const url = new URL(`https://api.notion.com/v1/blocks/${encodeURIComponent(blockId)}/children`);
    url.searchParams.set('page_size', '100');
    if (cursor) url.searchParams.set('start_cursor', cursor);

    const res = await fetch(url.toString(), { headers });

    if (!res.ok) {
      if (res.status === 404) throw new Error('NOT_FOUND');
      const body = await res.text();
      throw new Error(`Notion API error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as BlocksResponse;

    for (const block of data.results) {
      if (block.in_trash) continue;

      const text = extractBlockText(block);
      if (text) texts.push(text);
      count++;

      if (block.has_children) {
        const children = await fetchBlocksRecursive(block.id, headers, depth + 1);
        texts.push(...children.texts);
        count += children.count;
      }
    }

    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);

  return { texts, count };
}

function parseArgs(argv: string[]): { pageId: string; fixture: string; help: boolean } {
  const args = argv.slice(2);
  let pageId = '';
  let fixture = 'default';
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--page-id' && args[i + 1]) {
      pageId = args[++i];
    } else if (args[i] === '--fixture' && args[i + 1]) {
      fixture = args[++i];
    } else if (args[i] === '--help') {
      help = true;
    }
  }

  return { pageId, fixture, help };
}

async function main(): Promise<void> {
  const { pageId, fixture, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx /tools/notion/get-page.ts --page-id <PAGE_ID> [--fixture <name>]\n\n' +
        'Fetches the text content of a Notion page by recursively fetching all blocks.\n\n' +
        'Options:\n' +
        '  --page-id <PAGE_ID>  Notion page ID (UUID) [required]\n' +
        '  --fixture <name>     Mock fixture name to load (default: default).\n' +
        '                       Only used when NOTION_MOCK=true.\n' +
        '  --help               Show this help message\n\n' +
        'Output: JSON object:\n' +
        '  { "success": true, "pageId": "...", "content": "...", "blockCount": N }\n' +
        '  { "success": false, "error": "..." }  (on 404)\n\n' +
        'Environment variables (one auth mode required):\n' +
        '  OAuth:   NOTION_ACCESS_TOKEN\n' +
        '  API key: NOTION_API_KEY\n\n' +
        'Mock mode:\n' +
        '  NOTION_MOCK=true  Load fixture from fixtures/get-page/<name>.json\n' +
        '                    instead of calling the Notion API\n',
    );
    process.exit(0);
  }

  if (process.env['NOTION_MOCK'] === 'true') {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const fixturePath = join(__dirname, 'fixtures', 'get-page', `${fixture}.json`);
    const fixtureData = JSON.parse(readFileSync(fixturePath, 'utf8')) as BlocksResponse;

    const texts: string[] = [];
    let count = 0;

    for (const block of fixtureData.results) {
      if (block.in_trash) continue;
      const text = extractBlockText(block);
      if (text) texts.push(text);
      count++;
    }

    const output: PageOutput = {
      success: true,
      pageId,
      content: texts.join('\n'),
      blockCount: count,
    };
    process.stdout.write(JSON.stringify(output) + '\n');
    return;
  }

  if (!pageId) {
    process.stderr.write('Error: --page-id is required\n');
    process.exit(1);
  }

  const { resolveNotionAuth } = await import('./auth.js');
  const { headers } = resolveNotionAuth();

  const authHeaders: Record<string, string> = {
    ...headers,
    'Notion-Version': NOTION_API_VERSION,
  };

  try {
    const { texts, count } = await fetchBlocksRecursive(pageId, authHeaders, 0);

    const output: PageOutput = {
      success: true,
      pageId,
      content: texts.join('\n'),
      blockCount: count,
    };
    process.stdout.write(JSON.stringify(output) + '\n');
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      const output: PageOutput = {
        success: false,
        error: 'Page not found. Is it shared with the Notion integration?',
      };
      process.stdout.write(JSON.stringify(output) + '\n');
      return;
    }
    throw err;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`Fatal: ${String(err)}\n`);
    process.exit(1);
  });
}
