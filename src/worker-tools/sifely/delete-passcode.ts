#!/usr/bin/env tsx
/**
 * delete-passcode — Delete a passcode from a Sifely lock
 *
 * Usage:
 *   tsx src/worker-tools/sifely/delete-passcode.ts --lock-id <id> --passcode-id <id>
 *
 * Arguments:
 *   --lock-id <id>      (required) Sifely lock ID
 *   --passcode-id <id>  (required) Sifely passcode (keyboardPwdId) to delete
 *
 * Environment variables:
 *   SIFELY_USERNAME  (required) Sifely account username
 *   SIFELY_PASSWORD  (required) Sifely account password
 *   SIFELY_CLIENT_ID (optional) Defaults to 'VLRE'
 *   SIFELY_BASE_URL  (optional) Defaults to 'https://app-smart-server.sifely.com'
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
        'Usage: tsx src/worker-tools/sifely/delete-passcode.ts --lock-id <id> --passcode-id <id>',
        '',
        'Delete a passcode from a Sifely lock.',
        '',
        'Arguments:',
        '  --lock-id <id>      (required) Sifely lock ID',
        '  --passcode-id <id>  (required) Passcode ID (keyboardPwdId) to delete',
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
      'Usage: tsx src/worker-tools/sifely/delete-passcode.ts --lock-id <id> --passcode-id <id>\n',
    );
    process.exit(1);
  }

  const passcodeIdIndex = args.indexOf('--passcode-id');
  if (passcodeIdIndex === -1 || !args[passcodeIdIndex + 1]) {
    process.stderr.write('Error: --passcode-id <id> is required\n');
    process.stderr.write(
      'Usage: tsx src/worker-tools/sifely/delete-passcode.ts --lock-id <id> --passcode-id <id>\n',
    );
    process.exit(1);
  }

  const lockId = args[lockIdIndex + 1];
  const passcodeId = args[passcodeIdIndex + 1];

  const config = resolveConfig();
  const token = await login(config.baseUrl, config.clientId, config.username, config.password);

  await withRetry<{ ok: true }>(async () => {
    const params = new URLSearchParams({
      lockId,
      keyboardPwdId: passcodeId,
      deleteType: '1',
      date: String(Date.now()),
    });

    const response = await fetch(`${config.baseUrl}/v3/keyboardPwd/delete?${params.toString()}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Sifely deletePasscode HTTP error: ${response.status} ${response.statusText}`,
      );
    }

    const body = (await response.json()) as SifelyMutationResponse;
    assertMutationSuccess(body, 'deletePasscode');

    return { ok: true };
  });

  process.stdout.write(JSON.stringify({ ok: true }) + '\n');
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
