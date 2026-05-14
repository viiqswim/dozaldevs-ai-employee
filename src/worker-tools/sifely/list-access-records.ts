#!/usr/bin/env tsx
/**
 * list-access-records — List access records for a given Sifely lock
 *
 * Usage:
 *   tsx src/worker-tools/sifely/list-access-records.ts --lock-id <id> [--start-date <ms>] [--end-date <ms>] [--human]
 *
 * Arguments:
 *   --lock-id <id>           (required) Sifely lock ID
 *   --start-date <ms>        (optional) Start of date range in epoch milliseconds. Defaults to 7 days ago.
 *   --end-date <ms>          (optional) End of date range in epoch milliseconds. Defaults to now.
 *   --human                  (optional) Add recordTypeLabel field with human-readable record type name.
 *
 * Environment variables:
 *   SIFELY_USERNAME  (required) Sifely account username
 *   SIFELY_PASSWORD  (required) Sifely account password
 *   SIFELY_CLIENT_ID (optional) Defaults to 'VLRE'
 *   SIFELY_BASE_URL  (optional) Defaults to 'https://app-smart-server.sifely.com'
 *
 * Output: JSON array of AccessRecord objects written to stdout
 */

import { login, resolveConfig, withRetry, assertListSuccess } from './lib/api.js';
import type { AccessRecord, SifelyListResponse, SifelyAccessRecordRaw } from './lib/api.js';

const MAX_PAGES = 100;
const PAGE_SIZE = 100;

const RECORD_TYPE_LABELS: Record<number, string> = {
  4: 'Passcode',
  13: 'Failed Attempt',
  20: 'Fingerprint',
  28: 'Gateway/Remote',
  47: 'Auto-Lock',
};

function getRecordTypeLabel(recordTypeFromLock: number): string {
  return RECORD_TYPE_LABELS[recordTypeFromLock] ?? `Unknown (${recordTypeFromLock})`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(
      [
        'Usage: tsx src/worker-tools/sifely/list-access-records.ts --lock-id <id> [--start-date <ms>] [--end-date <ms>] [--human]',
        '',
        'List ALL access records for a Sifely lock (auto-paginates all results).',
        '',
        'Arguments:',
        '  --lock-id <id>           (required) Sifely lock ID',
        '  --start-date <ms>        (optional) Start of date range in epoch milliseconds. Defaults to 7 days ago.',
        '  --end-date <ms>          (optional) End of date range in epoch milliseconds. Defaults to now.',
        '  --human                  (optional) Add recordTypeLabel field with human-readable record type name.',
        '',
        'Environment variables:',
        '  SIFELY_USERNAME  (required) Sifely account username',
        '  SIFELY_PASSWORD  (required) Sifely account password',
        '  SIFELY_CLIENT_ID (optional) Client ID, defaults to VLRE',
        '  SIFELY_BASE_URL  (optional) API base URL',
        '',
        'Output: JSON array of AccessRecord objects to stdout',
        'Record type labels (--human): Passcode, Fingerprint, Gateway/Remote, Auto-Lock, Failed Attempt, Unknown (N)',
        '',
        'Options:',
        '  --help, -h  Show this help message',
        '',
      ].join('\n'),
    );
    process.exit(0);
  }

  const lockIdIndex = args.indexOf('--lock-id');
  if (lockIdIndex === -1 || !args[lockIdIndex + 1]) {
    process.stderr.write('Error: --lock-id <id> is required\n');
    process.stderr.write(
      'Usage: tsx src/worker-tools/sifely/list-access-records.ts --lock-id <id> [--start-date <ms>] [--end-date <ms>] [--human]\n',
    );
    process.exit(1);
  }

  const lockId = args[lockIdIndex + 1];

  const startDateIndex = args.indexOf('--start-date');
  let startMs: number;
  if (startDateIndex !== -1 && args[startDateIndex + 1]) {
    const startDateRaw = args[startDateIndex + 1];
    if (isNaN(Number(startDateRaw))) {
      process.stderr.write(
        `Error: --start-date must be a numeric epoch milliseconds value, got: ${startDateRaw}\n`,
      );
      process.exit(1);
    }
    startMs = Number(startDateRaw);
  } else {
    startMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  }

  const endDateIndex = args.indexOf('--end-date');
  let endMs: number;
  if (endDateIndex !== -1 && args[endDateIndex + 1]) {
    const endDateRaw = args[endDateIndex + 1];
    if (isNaN(Number(endDateRaw))) {
      process.stderr.write(
        `Error: --end-date must be a numeric epoch milliseconds value, got: ${endDateRaw}\n`,
      );
      process.exit(1);
    }
    endMs = Number(endDateRaw);
  } else {
    endMs = Date.now();
  }

  const human = args.includes('--human');

  const config = resolveConfig();
  const token = await login(config.baseUrl, config.clientId, config.username, config.password);

  async function fetchPage(pageNo: number): Promise<SifelyListResponse<SifelyAccessRecordRaw>> {
    return withRetry<SifelyListResponse<SifelyAccessRecordRaw>>(async () => {
      // CRITICAL: date MUST be rebuilt fresh every call — stale timestamps cause 500s
      const params = new URLSearchParams({
        lockId,
        startDate: String(startMs),
        endDate: String(endMs),
        pageNo: String(pageNo),
        pageSize: String(PAGE_SIZE),
        date: String(Date.now()),
      });

      const response = await fetch(`${config.baseUrl}/v3/lockRecord/list?${params.toString()}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(
          `Sifely listAccessRecords HTTP error: ${response.status} ${response.statusText}`,
        );
      }

      return (await response.json()) as SifelyListResponse<SifelyAccessRecordRaw>;
    });
  }

  const firstBody = await fetchPage(1);
  assertListSuccess(firstBody, 'listAccessRecords');

  const totalPages = firstBody.pages ?? 1;

  if (totalPages > MAX_PAGES) {
    process.stderr.write(
      `Warning: ${totalPages} pages available, only fetching first ${MAX_PAGES}\n`,
    );
  }

  const cappedPages = Math.min(totalPages, MAX_PAGES);
  const allRecords: SifelyAccessRecordRaw[] = [...(firstBody.list ?? [])];

  for (let page = 2; page <= cappedPages; page++) {
    const pageBody = await fetchPage(page);
    assertListSuccess(pageBody, 'listAccessRecords');
    allRecords.push(...(pageBody.list ?? []));
  }

  const records: AccessRecord[] = allRecords.map((item: SifelyAccessRecordRaw): AccessRecord => {
    const record: AccessRecord = {
      recordId: item.recordId,
      lockId: item.lockId,
      recordType: item.recordType,
      recordTypeFromLock: item.recordTypeFromLock,
      success: item.success,
      keyboardPwd: item.keyboardPwd,
      lockDate: item.lockDate,
      serverDate: item.serverDate,
      username: item.username,
      hotelUsername: item.hotelUsername,
      keyName: item.keyName,
    };
    if (human) {
      record.recordTypeLabel = getRecordTypeLabel(item.recordTypeFromLock);
    }
    return record;
  });

  process.stdout.write(JSON.stringify(records) + '\n');
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
