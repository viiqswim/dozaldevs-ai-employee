#!/usr/bin/env tsx
/**
 * update-passcode — Update an existing passcode on a Sifely lock
 *
 * Usage:
 *   tsx src/worker-tools/sifely/update-passcode.ts --lock-id <id> --passcode-id <id> [options]
 *
 * Arguments:
 *   --lock-id <id>      (required) Sifely lock ID
 *   --passcode-id <id>  (required) Sifely keyboard password ID to update
 *   --name <name>       (optional) New name for the passcode
 *   --code <digits>     (optional) New passcode digits
 *   --start-date <ms>   (optional) New start date as epoch milliseconds
 *   --end-date <ms>     (optional) New end date as epoch milliseconds
 *
 * Environment variables:
 *   SIFELY_USERNAME  (required) Sifely account username
 *   SIFELY_PASSWORD  (required) Sifely account password
 *   SIFELY_CLIENT_ID (optional) Client ID, defaults to VLRE
 *   SIFELY_BASE_URL  (optional) API base URL
 *
 * Output: { "ok": true } written to stdout on success
 */

import { login, resolveConfig, withRetry, assertMutationSuccess } from './lib/api.js';
import type { SifelyMutationResponse } from './lib/api.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(
      [
        'Usage: tsx src/worker-tools/sifely/update-passcode.ts --lock-id <id> --passcode-id <id> [options]',
        '',
        'Update an existing passcode on a Sifely lock.',
        '',
        'Arguments:',
        '  --lock-id <id>      (required) Sifely lock ID',
        '  --passcode-id <id>  (required) Sifely keyboard password ID to update',
        '  --name <name>       (optional) New name for the passcode',
        '  --code <digits>     (optional) New passcode digits',
        '  --start-date <ms>   (optional) New start date as epoch milliseconds',
        '  --end-date <ms>     (optional) New end date as epoch milliseconds',
        '',
        'Environment variables:',
        '  SIFELY_USERNAME  (required) Sifely account username',
        '  SIFELY_PASSWORD  (required) Sifely account password',
        '  SIFELY_CLIENT_ID (optional) Client ID, defaults to VLRE',
        '  SIFELY_BASE_URL  (optional) API base URL',
        '',
        'Output: { "ok": true } to stdout on success',
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
      'Usage: tsx src/worker-tools/sifely/update-passcode.ts --lock-id <id> --passcode-id <id>\n',
    );
    process.exit(1);
  }

  const passcodeIdIndex = args.indexOf('--passcode-id');
  if (passcodeIdIndex === -1 || !args[passcodeIdIndex + 1]) {
    process.stderr.write('Error: --passcode-id <id> is required\n');
    process.stderr.write(
      'Usage: tsx src/worker-tools/sifely/update-passcode.ts --lock-id <id> --passcode-id <id>\n',
    );
    process.exit(1);
  }

  const lockId = args[lockIdIndex + 1];
  const passcodeId = args[passcodeIdIndex + 1];

  const nameIndex = args.indexOf('--name');
  const name = nameIndex !== -1 ? args[nameIndex + 1] : undefined;

  const codeIndex = args.indexOf('--code');
  const newCode = codeIndex !== -1 ? args[codeIndex + 1] : undefined;

  const startDateIndex = args.indexOf('--start-date');
  const startDate =
    startDateIndex !== -1 && args[startDateIndex + 1]
      ? Number(args[startDateIndex + 1])
      : undefined;

  const endDateIndex = args.indexOf('--end-date');
  const endDate =
    endDateIndex !== -1 && args[endDateIndex + 1] ? Number(args[endDateIndex + 1]) : undefined;

  const config = resolveConfig();
  const token = await login(config.baseUrl, config.clientId, config.username, config.password);

  await withRetry<void>(async () => {
    const params = new URLSearchParams({
      lockId,
      keyboardPwdId: passcodeId,
      changeType: '1',
      date: String(Date.now()),
    });

    if (name) {
      params.set('keyboardPwdName', name);
    }
    if (startDate !== undefined) {
      params.set('startDate', String(startDate));
    }
    if (endDate !== undefined) {
      params.set('endDate', String(endDate));
    }
    if (newCode !== undefined) {
      params.set('newKeyboardPwd', newCode);
    }

    const response = await fetch(`${config.baseUrl}/v3/keyboardPwd/change?${params.toString()}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Sifely updatePasscode HTTP error: ${response.status} ${response.statusText}`,
      );
    }

    const body = (await response.json()) as SifelyMutationResponse;
    assertMutationSuccess(body, 'updatePasscode');
  });

  process.stdout.write(JSON.stringify({ ok: true }) + '\n');
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
