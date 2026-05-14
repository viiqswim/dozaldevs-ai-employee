#!/usr/bin/env tsx
/**
 * list-locks — List all Sifely locks
 *
 * Usage:
 *   tsx src/worker-tools/sifely/list-locks.ts
 *
 * Environment variables:
 *   SIFELY_USERNAME  (required) Sifely account username
 *   SIFELY_PASSWORD  (required) Sifely account password
 *   SIFELY_CLIENT_ID (optional) Defaults to 'VLRE'
 *   SIFELY_BASE_URL  (optional) Defaults to 'https://app-smart-server.sifely.com'
 *
 * Output: JSON array of SifelyLock objects written to stdout
 */

import { login, resolveConfig, withRetry, assertMutationSuccess } from './lib/api.js';
import type { SifelyLock, SifelyLockListResponse } from './lib/api.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(
      [
        'Usage: tsx src/worker-tools/sifely/list-locks.ts [--help]',
        '',
        'List all Sifely locks.',
        '',
        'Environment variables:',
        '  SIFELY_USERNAME  (required) Sifely account username',
        '  SIFELY_PASSWORD  (required) Sifely account password',
        '  SIFELY_CLIENT_ID (optional) Client ID, defaults to VLRE',
        '  SIFELY_BASE_URL  (optional) API base URL',
        '',
        'Output: JSON array of lock objects to stdout',
        '',
        'Options:',
        '  --help, -h  Show this help message',
        '',
      ].join('\n'),
    );
    process.exit(0);
  }

  const config = resolveConfig();
  const token = await login(config.baseUrl, config.clientId, config.username, config.password);

  const locks = await withRetry<SifelyLock[]>(async () => {
    const params = new URLSearchParams({
      pageNo: '1',
      pageSize: '1000',
      date: String(Date.now()),
    });

    const response = await fetch(`${config.baseUrl}/v3/lock/list?${params.toString()}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Sifely listLocks HTTP error: ${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as SifelyLockListResponse;
    assertMutationSuccess(body, 'listLocks');

    return body.list ?? [];
  });

  process.stdout.write(JSON.stringify(locks) + '\n');
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
