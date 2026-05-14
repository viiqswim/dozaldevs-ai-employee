#!/usr/bin/env tsx
/**
 * list-access-records — List access records for a given Sifely lock
 *
 * Usage:
 *   tsx src/worker-tools/sifely/list-access-records.ts --lock-id <id> --start-date <ms> --end-date <ms>
 *
 * Arguments:
 *   --lock-id <id>       (required) Sifely lock ID
 *   --start-date <ms>    (required) Start of date range in epoch milliseconds
 *   --end-date <ms>      (required) End of date range in epoch milliseconds
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

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(
      [
        'Usage: tsx src/worker-tools/sifely/list-access-records.ts --lock-id <id> --start-date <ms> --end-date <ms>',
        '',
        'List access records for a given Sifely lock.',
        '',
        'Arguments:',
        '  --lock-id <id>       (required) Sifely lock ID',
        '  --start-date <ms>    (required) Start of date range in epoch milliseconds',
        '  --end-date <ms>      (required) End of date range in epoch milliseconds',
        '',
        'Environment variables:',
        '  SIFELY_USERNAME  (required) Sifely account username',
        '  SIFELY_PASSWORD  (required) Sifely account password',
        '  SIFELY_CLIENT_ID (optional) Client ID, defaults to VLRE',
        '  SIFELY_BASE_URL  (optional) API base URL',
        '',
        'Output: JSON array of AccessRecord objects to stdout',
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
      'Usage: tsx src/worker-tools/sifely/list-access-records.ts --lock-id <id> --start-date <ms> --end-date <ms>\n',
    );
    process.exit(1);
  }

  const lockId = args[lockIdIndex + 1];

  const startDateIndex = args.indexOf('--start-date');
  if (startDateIndex === -1 || !args[startDateIndex + 1]) {
    process.stderr.write('Error: --start-date <ms> is required\n');
    process.stderr.write(
      'Usage: tsx src/worker-tools/sifely/list-access-records.ts --lock-id <id> --start-date <ms> --end-date <ms>\n',
    );
    process.exit(1);
  }

  const startDateRaw = args[startDateIndex + 1];
  if (isNaN(Number(startDateRaw))) {
    process.stderr.write(
      `Error: --start-date must be a numeric epoch milliseconds value, got: ${startDateRaw}\n`,
    );
    process.exit(1);
  }

  const endDateIndex = args.indexOf('--end-date');
  if (endDateIndex === -1 || !args[endDateIndex + 1]) {
    process.stderr.write('Error: --end-date <ms> is required\n');
    process.stderr.write(
      'Usage: tsx src/worker-tools/sifely/list-access-records.ts --lock-id <id> --start-date <ms> --end-date <ms>\n',
    );
    process.exit(1);
  }

  const endDateRaw = args[endDateIndex + 1];
  if (isNaN(Number(endDateRaw))) {
    process.stderr.write(
      `Error: --end-date must be a numeric epoch milliseconds value, got: ${endDateRaw}\n`,
    );
    process.exit(1);
  }

  const startMs = Number(startDateRaw);
  const endMs = Number(endDateRaw);

  const config = resolveConfig();
  const token = await login(config.baseUrl, config.clientId, config.username, config.password);

  const records = await withRetry<AccessRecord[]>(async () => {
    const params = new URLSearchParams({
      lockId,
      startDate: String(startMs),
      endDate: String(endMs),
      pageNo: '1',
      pageSize: '20',
      date: String(Date.now()),
    });

    const response = await fetch(`${config.baseUrl}/v3/lockRecord/list?${params.toString()}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(
        `Sifely listAccessRecords HTTP error: ${response.status} ${response.statusText}`,
      );
    }

    const body = (await response.json()) as SifelyListResponse<SifelyAccessRecordRaw>;
    assertListSuccess(body, 'listAccessRecords');

    return (body.list ?? []).map(
      (item: SifelyAccessRecordRaw): AccessRecord => ({
        recordId: item.recordId,
        lockId: item.lockId,
        recordType: item.recordType,
        success: item.success,
        keyboardPwd: item.keyboardPwd,
        lockDate: item.lockDate,
        serverDate: item.serverDate,
      }),
    );
  });

  process.stdout.write(JSON.stringify(records) + '\n');
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
