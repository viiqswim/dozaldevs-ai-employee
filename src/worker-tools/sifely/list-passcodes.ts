#!/usr/bin/env tsx
/**
 * list-passcodes — List all passcodes for a given Sifely lock
 *
 * Usage:
 *   tsx src/worker-tools/sifely/list-passcodes.ts --lock-id <id>
 *
 * Arguments:
 *   --lock-id <id>  (required) Sifely lock ID
 *
 * Environment variables:
 *   SIFELY_USERNAME  (required) Sifely account username
 *   SIFELY_PASSWORD  (required) Sifely account password
 *   SIFELY_CLIENT_ID (optional) Defaults to 'VLRE'
 *   SIFELY_BASE_URL  (optional) Defaults to 'https://app-smart-server.sifely.com'
 *
 * Output: JSON array of LockPasscode objects written to stdout
 */

import { login, resolveConfig, withRetry, assertListSuccess } from './lib/api.js';
import type { LockPasscode, SifelyListResponse, SifelyPasscodeRaw } from './lib/api.js';
import { getArg } from '../lib/get-arg.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(
      [
        'Usage: tsx src/worker-tools/sifely/list-passcodes.ts --lock-id <id>',
        '',
        'List all passcodes for a given Sifely lock.',
        '',
        'Arguments:',
        '  --lock-id <id>  (required) Sifely lock ID',
        '',
        'Environment variables:',
        '  SIFELY_USERNAME  (required) Sifely account username',
        '  SIFELY_PASSWORD  (required) Sifely account password',
        '  SIFELY_CLIENT_ID (optional) Client ID, defaults to VLRE',
        '  SIFELY_BASE_URL  (optional) API base URL',
        '',
        'Output: JSON array of LockPasscode objects to stdout',
        '',
        'Options:',
        '  --help, -h  Show this help message',
        '',
      ].join('\n'),
    );
    process.exit(0);
  }

  const lockId = getArg(args, '--lock-id') ?? '';
  if (!lockId) {
    process.stderr.write('Error: --lock-id <id> is required\n');
    process.stderr.write('Usage: tsx src/worker-tools/sifely/list-passcodes.ts --lock-id <id>\n');
    process.exit(1);
  }

  const config = resolveConfig();
  const token = await login(config.baseUrl, config.clientId, config.username, config.password);

  const passcodes = await withRetry<LockPasscode[]>(async () => {
    const params = new URLSearchParams({
      lockId,
      pageNo: '1',
      pageSize: '100',
      date: String(Date.now()),
    });

    const response = await fetch(`${config.baseUrl}/v3/lock/listKeyboardPwd?${params.toString()}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`Sifely listPasscodes HTTP error: ${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as SifelyListResponse<SifelyPasscodeRaw>;
    assertListSuccess(body, 'listPasscodes');

    return (body.list ?? []).map(
      (item: SifelyPasscodeRaw): LockPasscode => ({
        keyboardPwdId: item.keyboardPwdId,
        lockId,
        keyboardPwd: item.keyboardPwd,
        keyboardPwdName: item.keyboardPwdName,
        keyboardPwdType: item.keyboardPwdType,
        startDate: item.startDate,
        endDate: item.endDate,
        status: item.status,
      }),
    );
  });

  process.stdout.write(JSON.stringify(passcodes) + '\n');
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
