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

const MOCK_LOCK = {
  lockId: 11111,
  lockName: 'Test Lock',
  lockAlias: 'TL',
  lockMac: 'AA:BB:CC:DD:EE:FF',
  electricQuantity: 100,
  hasGateway: 1,
};

const MOCK_EXISTING_PASSCODE = {
  keyboardPwdId: 55555,
  keyboardPwd: '111111',
  keyboardPwdName: 'test-existing-passcode',
  keyboardPwdType: 2,
  startDate: 0,
  endDate: 0,
  status: 1,
};

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
      } else if (lockId === 'dup-test') {
        res.writeHead(200);
        res.end(JSON.stringify({ list: [...MOCK_PASSCODES, MOCK_EXISTING_PASSCODE] }));
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
    } else if (pathname === '/v3/lock/list') {
      res.writeHead(200);
      res.end(JSON.stringify({ list: [MOCK_LOCK] }));
    } else if (pathname === '/v3/keyboardPwd/add') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        const params = new URLSearchParams(body);
        const keyboardPwd = params.get('keyboardPwd');
        res.writeHead(200);
        if (keyboardPwd === '987654') {
          res.end(JSON.stringify({ keyboardPwdId: 99999 }));
        } else if (keyboardPwd === '000000') {
          res.end(JSON.stringify({ code: 400, msg: 'test error' }));
        } else {
          res.end(JSON.stringify({ keyboardPwdId: 77777 }));
        }
      });
    } else if (pathname === '/v3/keyboardPwd/change') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        res.writeHead(200);
        res.end(JSON.stringify({ errcode: 0, errmsg: 'success' }));
      });
    } else if (pathname === '/v3/keyboardPwd/delete') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        res.writeHead(200);
        res.end(JSON.stringify({ errcode: 0, errmsg: 'success' }));
      });
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

  it('list-locks returns JSON array with lockId, lockName, lockAlias fields', async () => {
    const { stdout, code } = await runScript(['--action', 'list-locks'], {
      ...BASE_ENV,
      SIFELY_BASE_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as Record<string, unknown>[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty('lockId', 11111);
    expect(data[0]).toHaveProperty('lockName', 'Test Lock');
    expect(data[0]).toHaveProperty('lockAlias', 'TL');
  }, 15000);

  it('create-passcode returns keyboardPwdId on success', async () => {
    const { stdout, code } = await runScript(
      [
        '--action',
        'create-passcode',
        '--lock-id',
        '12345',
        '--name',
        'new-passcode',
        '--code',
        '987654',
      ],
      { ...BASE_ENV, SIFELY_BASE_URL: `http://localhost:${port}` },
    );
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as Record<string, unknown>;
    expect(data).toHaveProperty('keyboardPwdId', 99999);
  }, 15000);

  it('create-passcode returns existed=true when name already exists', async () => {
    const { stdout, code } = await runScript(
      [
        '--action',
        'create-passcode',
        '--lock-id',
        'dup-test',
        '--name',
        'test-existing-passcode',
        '--code',
        '111111',
      ],
      { ...BASE_ENV, SIFELY_BASE_URL: `http://localhost:${port}` },
    );
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as Record<string, unknown>;
    expect(data).toHaveProperty('existed', true);
    expect(data).toHaveProperty('keyboardPwdId', 55555);
  }, 15000);

  it('create-passcode exits 1 with invalid code format (non-numeric)', async () => {
    const { stderr, code } = await runScript(
      ['--action', 'create-passcode', '--lock-id', '12345', '--name', 'test', '--code', 'abc123'],
      {},
    );
    expect(code).toBe(1);
    expect(stderr).toMatch(/numeric|4-9/);
  }, 15000);

  it('create-passcode exits 1 with invalid code length (too short)', async () => {
    const { stderr, code } = await runScript(
      ['--action', 'create-passcode', '--lock-id', '12345', '--name', 'test', '--code', '123'],
      {},
    );
    expect(code).toBe(1);
    expect(stderr).toContain('4-9');
  }, 15000);

  it('update-passcode returns ok=true on success', async () => {
    const { stdout, code } = await runScript(
      [
        '--action',
        'update-passcode',
        '--lock-id',
        '12345',
        '--passcode-id',
        '99999',
        '--name',
        'Updated',
      ],
      { ...BASE_ENV, SIFELY_BASE_URL: `http://localhost:${port}` },
    );
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as Record<string, unknown>;
    expect(data).toHaveProperty('ok', true);
  }, 15000);

  it('delete-passcode returns ok=true on success', async () => {
    const { stdout, code } = await runScript(
      ['--action', 'delete-passcode', '--lock-id', '12345', '--passcode-id', '99999'],
      { ...BASE_ENV, SIFELY_BASE_URL: `http://localhost:${port}` },
    );
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as Record<string, unknown>;
    expect(data).toHaveProperty('ok', true);
  }, 15000);

  it('exits 1 on Sifely API error during mutation (HTTP 200 with error code in body)', async () => {
    const { stderr, code } = await runScript(
      [
        '--action',
        'create-passcode',
        '--lock-id',
        '12345',
        '--name',
        'error-test',
        '--code',
        '000000',
      ],
      { ...BASE_ENV, SIFELY_BASE_URL: `http://localhost:${port}` },
    );
    expect(code).toBe(1);
    expect(stderr).toMatch(/createPasscode error|test error/);
  }, 15000);
});
