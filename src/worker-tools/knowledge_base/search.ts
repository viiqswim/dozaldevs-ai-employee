/**
 * knowledge_base/search.ts
 *
 * Shell tool for AI employees to fetch all knowledge base content for a given entity.
 * Returns entity-specific content and common (shared) policies concatenated together.
 * No keyword filtering — returns all content; the LLM interprets it.
 *
 * Usage:
 *   tsx /tools/knowledge_base/search.ts --entity-type <type> --entity-id <id> [--tenant-id <uuid>]
 *
 * Environment variables:
 *   SUPABASE_URL          (required) Base URL for PostgREST (e.g. http://localhost:54331)
 *   SUPABASE_SECRET_KEY   (required) Service role JWT for PostgREST auth
 *   TENANT_ID             (required if --tenant-id not provided) Tenant UUID
 *
 * Output (stdout on success):
 *   {
 *     "content": "<entity content>\n\n---\n\n# Common Policies\n\n<common content>",
 *     "entityFound": true,
 *     "commonFound": true,
 *     "entityType": "property",
 *     "entityId": "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"
 *   }
 *
 * Exit codes:
 *   0 — success (even if no rows found; content will be empty string)
 *   1 — missing required arg, missing required env var, or PostgREST error
 */

interface Args {
  entityType: string;
  entityId: string;
  tenantId: string;
  help: boolean;
}

interface KbRow {
  scope: string;
  content: string;
}

function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  let entityType = '';
  let entityId = '';
  let tenantId = '';
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--entity-type' && args[i + 1]) {
      entityType = args[++i];
    } else if (args[i] === '--entity-id' && args[i + 1]) {
      entityId = args[++i];
    } else if (args[i] === '--tenant-id' && args[i + 1]) {
      tenantId = args[++i];
    } else if (args[i] === '--help') {
      help = true;
    }
  }

  return { entityType, entityId, tenantId, help };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.help) {
    process.stdout.write(
      'Usage: tsx /tools/knowledge_base/search.ts --entity-type <type> --entity-id <id> [--tenant-id <uuid>]\n\n' +
        'Fetches all knowledge base content for a given entity from PostgREST.\n' +
        'Returns entity-specific content and common (shared) policies concatenated.\n' +
        'No keyword filtering — returns all content; the LLM interprets it.\n\n' +
        'Options:\n' +
        '  --entity-type <type>   (required) Entity type (e.g. property, restaurant)\n' +
        '  --entity-id <id>       (required) Entity ID — normalized to lowercase before querying\n' +
        '  --tenant-id <uuid>     (optional) Tenant UUID; falls back to TENANT_ID env var\n' +
        '  --help                 Show this help message\n\n' +
        'Environment variables:\n' +
        '  SUPABASE_URL           (required) Base URL for PostgREST (e.g. http://localhost:54331)\n' +
        '  SUPABASE_SECRET_KEY    (required) Service role JWT for PostgREST auth\n' +
        '  TENANT_ID              (required if --tenant-id not provided) Tenant UUID\n\n' +
        'Output (stdout on success):\n' +
        '  {\n' +
        '    "content": "<entity content>\\n\\n---\\n\\n# Common Policies\\n\\n<common content>",\n' +
        '    "entityFound": true,\n' +
        '    "commonFound": true,\n' +
        '    "entityType": "property",\n' +
        '    "entityId": "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"\n' +
        '  }\n\n' +
        'Exit codes:\n' +
        '  0 — success (even if no rows found; content will be empty string)\n' +
        '  1 — missing required arg, missing required env var, or PostgREST error\n',
    );
    process.exit(0);
  }

  const supabaseUrl = process.env['SUPABASE_URL'];
  if (!supabaseUrl) {
    process.stderr.write('Error: SUPABASE_URL environment variable is required\n');
    process.exit(1);
  }

  const supabaseKey = process.env['SUPABASE_SECRET_KEY'];
  if (!supabaseKey) {
    process.stderr.write('Error: SUPABASE_SECRET_KEY environment variable is required\n');
    process.exit(1);
  }

  const tenantId = args.tenantId || process.env['TENANT_ID'];
  if (!tenantId) {
    process.stderr.write(
      'Error: tenant ID is required — provide --tenant-id or set TENANT_ID environment variable\n',
    );
    process.exit(1);
  }

  if (!args.entityType) {
    process.stderr.write('Error: --entity-type is required\n');
    process.exit(1);
  }

  if (!args.entityId) {
    process.stderr.write('Error: --entity-id is required\n');
    process.exit(1);
  }

  const entityType = args.entityType;
  const entityId = args.entityId.toLowerCase();

  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    Accept: 'application/json',
  };

  const orFilter = `(scope.eq.common,and(scope.eq.entity,entity_type.eq.${encodeURIComponent(entityType)},entity_id.eq.${encodeURIComponent(entityId)}))`;
  const combinedUrl = `${supabaseUrl}/rest/v1/knowledge_base_entries?tenant_id=eq.${encodeURIComponent(tenantId)}&or=${orFilter}&select=scope,content`;

  let rows: KbRow[] = [];

  const combinedRes = await fetch(combinedUrl, { headers });

  if (!combinedRes.ok) {
    const commonUrl = `${supabaseUrl}/rest/v1/knowledge_base_entries?tenant_id=eq.${encodeURIComponent(tenantId)}&scope=eq.common&select=scope,content`;
    const entityUrl = `${supabaseUrl}/rest/v1/knowledge_base_entries?tenant_id=eq.${encodeURIComponent(tenantId)}&scope=eq.entity&entity_type=eq.${encodeURIComponent(entityType)}&entity_id=eq.${encodeURIComponent(entityId)}&select=scope,content`;

    const [commonRes, entityRes] = await Promise.all([
      fetch(commonUrl, { headers }),
      fetch(entityUrl, { headers }),
    ]);

    if (!commonRes.ok) {
      const body = await commonRes.text();
      process.stderr.write(`Error: PostgREST returned status ${commonRes.status}: ${body}\n`);
      process.exit(1);
    }

    if (!entityRes.ok) {
      const body = await entityRes.text();
      process.stderr.write(`Error: PostgREST returned status ${entityRes.status}: ${body}\n`);
      process.exit(1);
    }

    const commonRows = (await commonRes.json()) as KbRow[];
    const entityRows = (await entityRes.json()) as KbRow[];
    rows = [...commonRows, ...entityRows];
  } else {
    rows = (await combinedRes.json()) as KbRow[];
  }

  const entityRow = rows.find((r) => r.scope === 'entity');
  const commonRow = rows.find((r) => r.scope === 'common');

  let content = '';
  if (entityRow) content += entityRow.content;
  if (entityRow && commonRow) content += '\n\n---\n\n# Common Policies\n\n';
  if (commonRow) content += commonRow.content;

  const output = {
    content,
    entityFound: !!entityRow,
    commonFound: !!commonRow,
    entityType: entityType,
    entityId: entityId,
  };

  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write('Fatal: ' + String(err) + '\n');
  process.exit(1);
});
