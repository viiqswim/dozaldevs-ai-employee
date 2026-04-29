#!/usr/bin/env tsx
/**
 * resolve-hostfully-uids — Match VLRE properties to Hostfully UIDs
 *
 * Fetches all properties from the Hostfully API, matches them against
 * the standalone MVP's property-map.json by address, and outputs a
 * code-to-UID mapping JSON file.
 *
 * Usage:
 *   npx tsx scripts/resolve-hostfully-uids.ts --api-key <key> --agency-uid <uid>
 *   npx tsx scripts/resolve-hostfully-uids.ts --help
 *
 * Options:
 *   --api-key <key>      Hostfully API key (required)
 *   --agency-uid <uid>   Hostfully agency UID (required)
 *   --output <path>      Output file path (default: scripts/vlre-uid-mapping.json)
 *   --dry-run            Print JSON to stdout instead of writing file
 *   --help               Show this help message
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Args = {
  apiKey: string | null;
  agencyUid: string | null;
  output: string;
  dryRun: boolean;
  help: boolean;
};

function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  let apiKey: string | null = null;
  let agencyUid: string | null = null;
  let output = 'scripts/vlre-uid-mapping.json';
  let dryRun = false;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--api-key' && args[i + 1]) {
      apiKey = args[++i];
    } else if (args[i] === '--agency-uid' && args[i + 1]) {
      agencyUid = args[++i];
    } else if (args[i] === '--output' && args[i + 1]) {
      output = args[++i];
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--help') {
      help = true;
    }
  }

  return { apiKey, agencyUid, output, dryRun, help };
}

type PropertyMapEntry = {
  code: string;
  names: string[];
  address: string;
  kbFile: string;
};

type PropertyMap = {
  properties: PropertyMapEntry[];
};

type RawHostfullyProperty = {
  uid: string;
  name?: string;
  address?: {
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    countryCode?: string;
  };
};

type Mapping = {
  code: string;
  address: string;
  hostfullyUid: string;
  confidence: 'exact' | 'fuzzy';
};

type Unmatched = {
  code: string;
  address: string;
};

type OutputJson = {
  mappings: Mapping[];
  unmatched: Unmatched[];
};

function normalizeStreet(address: string): string {
  return address
    .toLowerCase()
    .trim()
    .replace(/[.,]+$/, '');
}

function extractStreet(fullAddress: string): string {
  // "3505 Banton Rd, Austin, TX 78722" → "3505 banton rd"
  return normalizeStreet(fullAddress.split(',')[0]);
}

function streetPrefix(street: string): string {
  // "3505 banton rd" → "3505 banton" (first two words for prefix matching)
  const words = street.split(/\s+/);
  return words.slice(0, 2).join(' ');
}

async function fetchAllProperties(
  apiKey: string,
  agencyUid: string,
): Promise<RawHostfullyProperty[]> {
  const baseUrl = 'https://api.hostfully.com/api/v3.2';
  const headers = { 'X-HOSTFULLY-APIKEY': apiKey, Accept: 'application/json' };
  const seenUids = new Set<string>();
  const allProperties: RawHostfullyProperty[] = [];
  let cursor: string | undefined = undefined;

  process.stderr.write('[INFO] Fetching properties from Hostfully...\n');

  do {
    const url = cursor
      ? `${baseUrl}/properties?agencyUid=${encodeURIComponent(agencyUid)}&cursor=${encodeURIComponent(cursor)}`
      : `${baseUrl}/properties?agencyUid=${encodeURIComponent(agencyUid)}`;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      process.stderr.write(`[ERROR] Failed to fetch properties: ${res.status} ${res.statusText}\n`);
      process.exit(1);
    }

    const json = (await res.json()) as {
      properties?: RawHostfullyProperty[];
      _paging?: { _nextCursor?: string };
    };

    const page = json.properties ?? [];
    let hasNew = false;
    for (const p of page) {
      if (p.uid && !seenUids.has(p.uid)) {
        seenUids.add(p.uid);
        allProperties.push(p);
        hasNew = true;
      }
    }

    cursor = json._paging?._nextCursor;
    if (!hasNew || !cursor) break;
  } while (true);

  process.stderr.write(`[INFO] Fetched ${allProperties.length} properties from Hostfully\n`);
  return allProperties;
}

function matchProperties(
  propertyMap: PropertyMapEntry[],
  hostfullyProperties: RawHostfullyProperty[],
): OutputJson {
  const mappings: Mapping[] = [];
  const unmatched: Unmatched[] = [];

  for (const entry of propertyMap) {
    const entryStreet = extractStreet(entry.address);
    const entryPrefix = streetPrefix(entryStreet);

    let matched: { uid: string; confidence: 'exact' | 'fuzzy' } | null = null;

    for (const hp of hostfullyProperties) {
      if (!hp.address?.address) continue;

      const hpStreet = normalizeStreet(hp.address.address);

      if (hpStreet === entryStreet) {
        matched = { uid: hp.uid.toLowerCase(), confidence: 'exact' };
        break;
      }

      if (!matched && hpStreet.startsWith(entryPrefix)) {
        matched = { uid: hp.uid.toLowerCase(), confidence: 'fuzzy' };
      }
    }

    if (matched) {
      process.stderr.write(`[MATCH] ${entry.code} → ${matched.uid} (${matched.confidence})\n`);
      mappings.push({
        code: entry.code,
        address: entry.address,
        hostfullyUid: matched.uid,
        confidence: matched.confidence,
      });
    } else {
      process.stderr.write(`[NO MATCH] ${entry.code}\n`);
      unmatched.push({ code: entry.code, address: entry.address });
    }
  }

  return { mappings, unmatched };
}

async function main(): Promise<void> {
  const { apiKey, agencyUid, output, dryRun, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: npx tsx scripts/resolve-hostfully-uids.ts --api-key <key> --agency-uid <uid> [options]\n\n' +
        'Fetches all VLRE properties from the Hostfully API, matches them against\n' +
        'property-map.json by address, and outputs a code-to-UID mapping JSON file.\n\n' +
        'Options:\n' +
        '  --api-key <key>      Hostfully API key (required)\n' +
        '  --agency-uid <uid>   Hostfully agency UID (required)\n' +
        '  --output <path>      Output file path (default: scripts/vlre-uid-mapping.json)\n' +
        '  --dry-run            Print JSON to stdout instead of writing file\n' +
        '  --help               Show this help message\n',
    );
    process.exit(0);
  }

  if (!apiKey) {
    process.stderr.write('Error: --api-key is required\n');
    process.exit(1);
  }

  if (!agencyUid) {
    process.stderr.write('Error: --agency-uid is required\n');
    process.exit(1);
  }

  const propertyMapPath = resolve(
    '/Users/victordozal/repos/real-estate/vlre-employee/knowledge-base/property-map.json',
  );
  const propertyMap: PropertyMap = JSON.parse(readFileSync(propertyMapPath, 'utf-8'));

  const hostfullyProperties = await fetchAllProperties(apiKey, agencyUid);

  const result = matchProperties(propertyMap.properties, hostfullyProperties);

  const total = propertyMap.properties.length;
  const matched = result.mappings.length;
  const unmatched = result.unmatched.length;
  process.stderr.write(`Matched: ${matched}/${total}, Unmatched: ${unmatched}\n`);

  const json = JSON.stringify(result, null, 2) + '\n';

  if (dryRun) {
    process.stdout.write(json);
  } else {
    const outputPath = resolve(output);
    writeFileSync(outputPath, json, 'utf-8');
    process.stderr.write(`[INFO] Written to ${outputPath}\n`);
  }

  process.exit(unmatched > 0 ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
