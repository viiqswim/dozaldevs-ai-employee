#!/usr/bin/env tsx
/**
 * create-passcode — Create a permanent passcode for a given Sifely lock
 *
 * Usage:
 *   tsx src/worker-tools/sifely/create-passcode.ts --lock-id <id> --name <name> --code <code>
 *
 * Arguments:
 *   --lock-id <id>    (required) Sifely lock ID
 *   --name <name>     (required) Human-readable name for the passcode
 *   --code <code>     (required) Numeric passcode, 4–9 digits
 *
 * Environment variables:
 *   SIFELY_USERNAME  (required) Sifely account username
 *   SIFELY_PASSWORD  (required) Sifely account password
 *   SIFELY_CLIENT_ID (optional) Defaults to 'VLRE'
 *   SIFELY_BASE_URL  (optional) Defaults to 'https://app-smart-server.sifely.com'
 *
 * Output: JSON object { "keyboardPwdId": <number> } written to stdout
 *         If a passcode with the same name already exists:
 *         { "keyboardPwdId": <number>, "existed": true }
 */

import type { ToolDescriptor } from '../lib/types.js';

export const descriptor: ToolDescriptor = {
  id: 'create-passcode',
  service: 'sifely',
  description: 'Create a permanent passcode for a given Sifely lock',
  envVars: ['SIFELY_USERNAME', 'SIFELY_PASSWORD'],
  args: [
    { name: '--lock-id', required: true, description: 'Sifely lock ID', type: 'string' },
    {
      name: '--name',
      required: true,
      description: 'Human-readable name for the passcode',
      type: 'string',
    },
    { name: '--code', required: true, description: 'Numeric passcode, 4–9 digits', type: 'string' },
  ],
};

import {
  login,
  resolveConfig,
  withRetry,
  assertMutationSuccess,
  assertListSuccess,
} from './lib/api.js';
import type {
  SifelyListResponse,
  SifelyPasscodeRaw,
  SifelyCreatePasscodeResponse,
} from './lib/api.js';
import { getArg } from '../lib/get-arg.js';

async function listPasscodes(
  baseUrl: string,
  token: string,
  lockId: string,
): Promise<SifelyPasscodeRaw[]> {
  const params = new URLSearchParams({
    lockId,
    pageNo: '1',
    pageSize: '100',
    date: String(Date.now()),
  });

  const response = await fetch(`${baseUrl}/v3/lock/listKeyboardPwd?${params.toString()}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Sifely listPasscodes HTTP error: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as SifelyListResponse<SifelyPasscodeRaw>;
  assertListSuccess(body, 'listPasscodes');

  return body.list ?? [];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(
      [
        'Usage: tsx src/worker-tools/sifely/create-passcode.ts --lock-id <id> --name <name> --code <code>',
        '',
        'Create a permanent passcode for a given Sifely lock.',
        '',
        'Arguments:',
        '  --lock-id <id>    (required) Sifely lock ID',
        '  --name <name>     (required) Human-readable name for the passcode',
        '  --code <code>     (required) Numeric passcode, 4–9 digits',
        '',
        'Environment variables:',
        '  SIFELY_USERNAME  (required) Sifely account username',
        '  SIFELY_PASSWORD  (required) Sifely account password',
        '  SIFELY_CLIENT_ID (optional) Client ID, defaults to VLRE',
        '  SIFELY_BASE_URL  (optional) API base URL',
        '',
        'Output: JSON object { "keyboardPwdId": <number> } to stdout',
        '        If name already exists: { "keyboardPwdId": <number>, "existed": true }',
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
    process.stderr.write(
      'Usage: tsx src/worker-tools/sifely/create-passcode.ts --lock-id <id> --name <name> --code <code>\n',
    );
    process.exit(1);
  }

  const name = getArg(args, '--name') ?? '';
  if (!name) {
    process.stderr.write('Error: --name <name> is required\n');
    process.stderr.write(
      'Usage: tsx src/worker-tools/sifely/create-passcode.ts --lock-id <id> --name <name> --code <code>\n',
    );
    process.exit(1);
  }

  const code = getArg(args, '--code') ?? '';
  if (!code) {
    process.stderr.write('Error: --code <code> is required\n');
    process.stderr.write(
      'Usage: tsx src/worker-tools/sifely/create-passcode.ts --lock-id <id> --name <name> --code <code>\n',
    );
    process.exit(1);
  }

  if (!/^\d{4,9}$/.test(code)) {
    process.stderr.write(
      'Error: --code must be a numeric string of 4–9 digits (e.g. 1234, 123456)\n',
    );
    process.exit(1);
  }

  const config = resolveConfig();
  const token = await login(config.baseUrl, config.clientId, config.username, config.password);

  // DEDUP CHECK: list existing passcodes and return early if name already exists
  const existingPasscodes = await listPasscodes(config.baseUrl, token, lockId);
  const existing = existingPasscodes.find((p) => p.keyboardPwdName === name);
  if (existing) {
    process.stdout.write(
      JSON.stringify({ keyboardPwdId: existing.keyboardPwdId, existed: true }) + '\n',
    );
    process.exit(0);
  }

  // CREATE: always permanent (keyboardPwdType: '2', endDate: '0')
  const result = await withRetry<{ keyboardPwdId: number }>(async () => {
    // Build ALL params inside the retry lambda — Sifely returns 500 on stale timestamps
    const params = new URLSearchParams({
      lockId,
      keyboardPwd: code,
      keyboardPwdName: name,
      keyboardPwdType: '2',
      startDate: String(Date.now()),
      endDate: '0',
      addType: '1',
      date: String(Date.now()),
    });

    const response = await fetch(`${config.baseUrl}/v3/keyboardPwd/add?${params.toString()}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(
        `Sifely createPasscode HTTP error: ${response.status} ${response.statusText}`,
      );
    }

    const body = (await response.json()) as SifelyCreatePasscodeResponse;
    assertMutationSuccess(body, 'createPasscode');

    return { keyboardPwdId: body.keyboardPwdId ?? 0 };
  });

  // POST-CREATE VERIFICATION: confirm the created passcode has keyboardPwdType === 2
  const verifyPasscodes = await listPasscodes(config.baseUrl, token, lockId);
  const created = verifyPasscodes.find((p) => p.keyboardPwdId === result.keyboardPwdId);
  if (created && created.keyboardPwdType !== 2) {
    process.stderr.write(
      `WARNING: Created passcode has keyboardPwdType=${created.keyboardPwdType}, expected 2 (permanent). The Sifely API may have changed behavior.\n`,
    );
  }

  process.stdout.write(JSON.stringify({ keyboardPwdId: result.keyboardPwdId }) + '\n');
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
