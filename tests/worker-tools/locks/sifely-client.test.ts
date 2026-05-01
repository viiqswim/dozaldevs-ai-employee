import { execFile } from 'child_process';
import * as http from 'http';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';

const SCRIPT_PATH = path.resolve(__dirname, '../../../src/worker-tools/locks/sifely-client.ts');

function runScript(
  args: string[],
  env: Record<string, string>,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      'npx',
      ['tsx', SCRIPT_PATH, ...args],
      { env: { ...process.env, ...env } },
      (err, stdout, stderr) => {
        resolve({ stdout, stderr, code: err ? ((err.code as number) ?? 1) : 0 });
      },
    );
  });
}

const MOCK_PASSCODES = [
  {
    keyboardPwdId: 1,
    keyboardPwd: '1234',
    keyboardPwdName: 'permanent-visitor-home',
    keyboardPwdType: 2,
    startDate: 0,
    endDate: 0,
    status: 1,
  },
];

const MOCK_ACCESS_RECORDS = [
  {
    recordId: 1,
    lockId: 12345,
    recordType: 4,
    success: 1,
    keyboardPwd: '1234',
    lockDate: 1700000000000,
    serverDate: 1700000000000,
  },
];

let server: http.Server;
let port: number;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const rawUrl = req.url ?? '';
    res.setHeader('Content-Type', 'application/json');

    const parsedUrl = new URL(rawUrl, 'http://localhost');
    const pathname = parsedUrl.pathname;
    const username = parsedUrl.searchParams.get('username') ?? '';
    const lockId = parsedUrl.searchParams.get('lockId') ?? '';

    if (pathname === '/system/smart/login') {
      if (username === 'auth-fail-user') {
        res.writeHead(200);
        res.end(JSON.stringify({ code: -3, msg: 'token expired' }));
      } else {
        res.writeHead(200);
        res.end(JSON.stringify({ code: 200, data: { token: 'mock-token' } }));
      }
    } else if (pathname === '/v3/lock/listKeyboardPwd') {
      if (lockId === 'api-error-lock') {
        res.writeHead(200);
        res.end(JSON.stringify({ code: -2012, msg: 'gateway offline' }));
      } else {
        res.writeHead(200);
        res.end(JSON.stringify({ list: MOCK_PASSCODES }));
      }
    } else if (pathname === '/v3/lockRecord/list') {
      if (lockId === 'api-error-lock') {
        res.writeHead(200);
        res.end(JSON.stringify({ code: -2012, msg: 'gateway offline' }));
      } else {
        res.writeHead(200);
        res.end(JSON.stringify({ list: MOCK_ACCESS_RECORDS }));
      }
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as { port: number }).port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

const BASE_ENV = {
  SIFELY_USERNAME: 'test-user',
  SIFELY_PASSWORD: 'test-pass',
  SIFELY_CLIENT_ID: 'TEST',
};

describe('sifely-client shell tool', () => {
  it('--help exits 0 with usage containing --action and --lock-id', async () => {
    const { stdout, code } = await runScript(['--help'], {});
    expect(code).toBe(0);
    expect(stdout).toContain('Usage:');
    expect(stdout).toContain('--action');
    expect(stdout).toContain('--lock-id');
  }, 15000);

  it('list-passcodes returns JSON array with correct fields', async () => {
    const { stdout, code } = await runScript(['--action', 'list-passcodes', '--lock-id', '12345'], {
      ...BASE_ENV,
      SIFELY_BASE_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as Record<string, unknown>[];
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0]).toHaveProperty('keyboardPwdId', 1);
    expect(data[0]).toHaveProperty('keyboardPwd', '1234');
    expect(data[0]).toHaveProperty('keyboardPwdType', 2);
  }, 15000);

  it('list-access-records returns JSON array with correct fields', async () => {
    const { stdout, code } = await runScript(
      [
        '--action',
        'list-access-records',
        '--lock-id',
        '12345',
        '--start-date',
        '1700000000000',
        '--end-date',
        '1700086400000',
      ],
      { ...BASE_ENV, SIFELY_BASE_URL: `http://localhost:${port}` },
    );
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as Record<string, unknown>[];
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0]).toHaveProperty('recordId', 1);
    expect(data[0]).toHaveProperty('lockId', 12345);
    expect(data[0]).toHaveProperty('keyboardPwd', '1234');
  }, 15000);

  it('exits 1 when SIFELY_USERNAME env var is missing', async () => {
    const { stderr, code } = await runScript(['--action', 'list-passcodes', '--lock-id', '12345'], {
      SIFELY_USERNAME: '',
      SIFELY_PASSWORD: 'test-pass',
      SIFELY_BASE_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(1);
    expect(stderr).toContain('SIFELY_USERNAME');
  }, 15000);

  it('exits 1 when --action flag is missing', async () => {
    const { stderr, code } = await runScript(['--lock-id', '12345'], {
      ...BASE_ENV,
      SIFELY_BASE_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(1);
    expect(stderr).toContain('--action');
  }, 15000);

  it('exits 1 on Sifely auth failure (HTTP 200 with error code in body)', async () => {
    const { stderr, code } = await runScript(['--action', 'list-passcodes', '--lock-id', '12345'], {
      SIFELY_USERNAME: 'auth-fail-user',
      SIFELY_PASSWORD: 'test-pass',
      SIFELY_CLIENT_ID: 'TEST',
      SIFELY_BASE_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(1);
    expect(stderr).toContain('authentication failed');
  }, 15000);

  it('exits 1 on Sifely API error during list (HTTP 200 with error code in body)', async () => {
    const { stderr, code } = await runScript(
      ['--action', 'list-passcodes', '--lock-id', 'api-error-lock'],
      { ...BASE_ENV, SIFELY_BASE_URL: `http://localhost:${port}` },
    );
    expect(code).toBe(1);
    expect(stderr).toContain('gateway offline');
  }, 15000);
});
