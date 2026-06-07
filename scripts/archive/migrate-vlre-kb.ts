#!/usr/bin/env tsx
/**
 * migrate-vlre-kb — Idempotent migration of VLRE property KB files to the platform via Admin API.
 *
 * Usage:
 *   npx tsx scripts/migrate-vlre-kb.ts --admin-key <key> [options]
 *   npx tsx scripts/migrate-vlre-kb.ts --help
 *
 * Options:
 *   --api-url <url>      Admin API base URL (default: http://localhost:7700)
 *   --admin-key <key>    Admin API key (required)
 *   --mapping <path>     Mapping file (default: scripts/vlre-uid-mapping.json)
 *   --kb-dir <path>      KB directory (default: /Users/victordozal/repos/real-estate/vlre-employee/knowledge-base)
 *   --dry-run            Log actions without calling API
 *   --help               Show this help message
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const TENANT_ID = '00000000-0000-0000-0000-000000000003';
const MAX_CHARS = 100_000;
const DEFAULT_KB_DIR = '/Users/victordozal/repos/real-estate/vlre-employee/knowledge-base';

type Mapping = {
  code: string;
  hostfullyUid: string;
  address: string;
  confidence: string;
};
type MappingFile = { mappings: Mapping[] };
type KbEntry = { id: string; content: string };
type Op = 'created' | 'updated' | 'skipped' | 'error';
type Args = {
  apiUrl: string;
  adminKey: string | null;
  mappingPath: string;
  kbDir: string;
  dryRun: boolean;
  help: boolean;
};

function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  let apiUrl = 'http://localhost:7700';
  let adminKey: string | null = null;
  let mappingPath = 'scripts/vlre-uid-mapping.json';
  let kbDir = DEFAULT_KB_DIR;
  let dryRun = false;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--api-url' && args[i + 1]) {
      apiUrl = args[++i];
    } else if (args[i] === '--admin-key' && args[i + 1]) {
      adminKey = args[++i];
    } else if (args[i] === '--mapping' && args[i + 1]) {
      mappingPath = args[++i];
    } else if (args[i] === '--kb-dir' && args[i + 1]) {
      kbDir = args[++i];
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--help') {
      help = true;
    }
  }

  return { apiUrl, adminKey, mappingPath, kbDir, dryRun, help };
}

function log(msg: string): void {
  process.stderr.write(msg + '\n');
}

async function kbGet(apiUrl: string, adminKey: string, qs: string): Promise<KbEntry[]> {
  const url = `${apiUrl}/admin/tenants/${TENANT_ID}/kb/entries?${qs}`;
  const res = await fetch(url, { headers: { 'X-Admin-Key': adminKey } });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  const data = (await res.json()) as { entries: KbEntry[] };
  return data.entries;
}

async function kbPost(
  apiUrl: string,
  adminKey: string,
  body: Record<string, string>,
): Promise<void> {
  const url = `${apiUrl}/admin/tenants/${TENANT_ID}/kb/entries`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'X-Admin-Key': adminKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${url} → ${res.status}`);
}

async function kbPatch(
  apiUrl: string,
  adminKey: string,
  entryId: string,
  content: string,
): Promise<void> {
  const url = `${apiUrl}/admin/tenants/${TENANT_ID}/kb/entries/${entryId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'X-Admin-Key': adminKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`PATCH ${url} → ${res.status}`);
}

async function upsert(
  apiUrl: string,
  adminKey: string,
  dryRun: boolean,
  label: string,
  content: string,
  qs: string,
  createBody: Record<string, string>,
): Promise<Op> {
  const lines = content.split('\n').length;
  const chars = content.length;

  if (dryRun) {
    log(`[DRY-RUN] ${label} (${lines} lines, ${chars} chars)`);
    return 'skipped';
  }

  try {
    const entries = await kbGet(apiUrl, adminKey, qs);
    if (entries.length === 0) {
      await kbPost(apiUrl, adminKey, { ...createBody, content });
      log(`[CREATE] ${label} (${lines} lines, ${chars} chars)`);
      return 'created';
    }
    const existing = entries[0];
    if (existing.content === content) {
      log(`[SKIP] ${label} — content unchanged`);
      return 'skipped';
    }
    await kbPatch(apiUrl, adminKey, existing.id, content);
    log(`[UPDATE] ${label} (${lines} lines, ${chars} chars)`);
    return 'updated';
  } catch (err) {
    log(`[ERROR] ${label}: ${String(err)}`);
    return 'error';
  }
}

async function main(): Promise<void> {
  const { apiUrl, adminKey, mappingPath, kbDir, dryRun, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: npx tsx scripts/migrate-vlre-kb.ts --admin-key <key> [options]\n\n' +
        'Idempotent migration of VLRE property KB files to the platform via Admin API.\n\n' +
        'Options:\n' +
        '  --api-url <url>      Admin API base URL (default: http://localhost:7700)\n' +
        '  --admin-key <key>    Admin API key (required)\n' +
        '  --mapping <path>     Mapping file (default: scripts/vlre-uid-mapping.json)\n' +
        '  --kb-dir <path>      KB directory (default: ' +
        DEFAULT_KB_DIR +
        ')\n' +
        '  --dry-run            Log actions without calling API\n' +
        '  --help               Show this help message\n',
    );
    process.exit(0);
  }

  if (!adminKey) {
    process.stderr.write('Error: --admin-key is required\n');
    process.exit(1);
  }

  const { mappings }: MappingFile = JSON.parse(readFileSync(resolve(mappingPath), 'utf-8'));

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  let commonDone = 0;
  const commonPath = resolve(kbDir, 'common.md');
  if (existsSync(commonPath)) {
    const content = readFileSync(commonPath, 'utf-8');
    if (content.length > MAX_CHARS) {
      log(`[WARN] common.md exceeds ${MAX_CHARS} chars (${content.length}) — skipping`);
      skipped++;
    } else {
      const op = await upsert(apiUrl, adminKey, dryRun, 'common', content, 'scope=common', {});
      if (op === 'created') {
        created++;
        commonDone = 1;
      } else if (op === 'updated') {
        updated++;
        commonDone = 1;
      } else if (op === 'skipped') {
        skipped++;
        commonDone = 1;
      } else {
        errors++;
      }
    }
  } else {
    log(`[WARN] common.md not found at ${commonPath}`);
  }

  let propertyDone = 0;
  const propertyTotal = mappings.length;

  for (const mapping of mappings) {
    const uid = mapping.hostfullyUid.toLowerCase();
    const propPath = resolve(kbDir, 'properties', `${mapping.code}.md`);

    if (!existsSync(propPath)) {
      log(`[WARN] ${mapping.code}.md not found — skipping`);
      skipped++;
      continue;
    }

    const content = readFileSync(propPath, 'utf-8');

    if (content.length > MAX_CHARS) {
      log(`[WARN] ${mapping.code}.md exceeds ${MAX_CHARS} chars (${content.length}) — skipping`);
      skipped++;
      continue;
    }

    const label = `${mapping.code} → ${uid.slice(0, 8)}...`;
    const op = await upsert(
      apiUrl,
      adminKey,
      dryRun,
      label,
      content,
      `entity_type=property&entity_id=${uid}`,
      { entity_type: 'property', entity_id: uid },
    );

    if (op === 'created') {
      created++;
      propertyDone++;
    } else if (op === 'updated') {
      updated++;
      propertyDone++;
    } else if (op === 'skipped') {
      skipped++;
      propertyDone++;
    } else {
      errors++;
    }
  }

  log(
    `Migrated: ${propertyDone}/${propertyTotal} properties + ${commonDone} common | ` +
      `Created: ${created} | Updated: ${updated} | Skipped: ${skipped} | Errors: ${errors}`,
  );

  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
