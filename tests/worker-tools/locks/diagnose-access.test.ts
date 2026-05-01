import { execFile } from 'child_process';
import * as http from 'http';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';

const SCRIPT_PATH = path.resolve(__dirname, '../../../src/worker-tools/locks/diagnose-access.ts');

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

const MOCK_LOCK_PASSCODES: Record<string, Array<Record<string, unknown>>> = {
  'lock-happy': [
    {
      keyboardPwdId: 1,
      keyboardPwd: '1234',
      keyboardPwdName: 'permanent-visitor-home',
      keyboardPwdType: 2,
      startDate: 0,
      endDate: 0,
      status: 1,
    },
  ],
  'lock-mismatch': [
    {
      keyboardPwdId: 2,
      keyboardPwd: '5678',
      keyboardPwdName: 'permanent-visitor-home',
      keyboardPwdType: 2,
      startDate: 0,
      endDate: 0,
      status: 1,
    },
  ],
  'lock-room': [
    {
      keyboardPwdId: 3,
      keyboardPwd: '1234',
      keyboardPwdName: 'permanent-visitor-room-1',
      keyboardPwdType: 2,
      startDate: 0,
      endDate: 0,
      status: 1,
    },
    {
      keyboardPwdId: 4,
      keyboardPwd: '5678',
      keyboardPwdName: 'permanent-visitor-room-2',
      keyboardPwdType: 2,
      startDate: 0,
      endDate: 0,
      status: 1,
    },
    {
      keyboardPwdId: 5,
      keyboardPwd: '9999',
      keyboardPwdName: 'permanent-visitor-home',
      keyboardPwdType: 2,
      startDate: 0,
      endDate: 0,
      status: 1,
    },
  ],
  'lock-no-passcode': [
    {
      keyboardPwdId: 6,
      keyboardPwd: '1234',
      keyboardPwdName: 'some-other-passcode',
      keyboardPwdType: 2,
      startDate: 0,
      endDate: 0,
      status: 1,
    },
  ],
  // lock-error intentionally absent — mock returns Sifely error body
  'lock-good': [
    {
      keyboardPwdId: 7,
      keyboardPwd: '1234',
      keyboardPwdName: 'permanent-visitor-home',
      keyboardPwdType: 2,
      startDate: 0,
      endDate: 0,
      status: 1,
    },
  ],
};

const MOCK_PROPERTY_LOCKS: Record<string, Array<Record<string, unknown>>> = {
  'no-lock-property': [],
  'happy-path-property': [
    {
      id: 'pl-1',
      tenant_id: 'test-tenant-123',
      property_external_id: 'happy-path-property',
      lock_external_id: 'lock-happy',
      lock_name: 'Front Door',
      lock_provider: 'sifely',
      lock_role: null,
      property_type: 'HOME',
      property_name: '219-PAU-HOME',
      passcode_name: null,
      lock_metadata: null,
    },
  ],
  'mismatch-property': [
    {
      id: 'pl-2',
      tenant_id: 'test-tenant-123',
      property_external_id: 'mismatch-property',
      lock_external_id: 'lock-mismatch',
      lock_name: 'Front Door',
      lock_provider: 'sifely',
      lock_role: null,
      property_type: 'HOME',
      property_name: '219-PAU-HOME',
      passcode_name: null,
      lock_metadata: null,
    },
  ],
  'room-property': [
    {
      id: 'pl-3',
      tenant_id: 'test-tenant-123',
      property_external_id: 'room-property',
      lock_external_id: 'lock-room',
      lock_name: 'Room 1 Door',
      lock_provider: 'sifely',
      lock_role: null,
      property_type: 'ROOM',
      property_name: '271-GIN-1',
      passcode_name: null,
      lock_metadata: null,
    },
  ],
  'auth-fail-property': [
    {
      id: 'pl-4',
      tenant_id: 'test-tenant-123',
      property_external_id: 'auth-fail-property',
      lock_external_id: 'lock-auth',
      lock_name: 'Front Door',
      lock_provider: 'sifely',
      lock_role: null,
      property_type: 'HOME',
      property_name: '219-PAU-HOME',
      passcode_name: null,
      lock_metadata: null,
    },
  ],
  'no-passcode-property': [
    {
      id: 'pl-5',
      tenant_id: 'test-tenant-123',
      property_external_id: 'no-passcode-property',
      lock_external_id: 'lock-no-passcode',
      lock_name: 'Front Door',
      lock_provider: 'sifely',
      lock_role: null,
      property_type: 'HOME',
      property_name: '219-PAU-HOME',
      passcode_name: null,
      lock_metadata: null,
    },
  ],
  'multi-lock-property': [
    {
      id: 'pl-6',
      tenant_id: 'test-tenant-123',
      property_external_id: 'multi-lock-property',
      lock_external_id: 'lock-error',
      lock_name: 'Lock A',
      lock_provider: 'sifely',
      lock_role: null,
      property_type: 'HOME',
      property_name: '219-PAU-HOME',
      passcode_name: null,
      lock_metadata: null,
    },
    {
      id: 'pl-7',
      tenant_id: 'test-tenant-123',
      property_external_id: 'multi-lock-property',
      lock_external_id: 'lock-good',
      lock_name: 'Lock B',
      lock_provider: 'sifely',
      lock_role: null,
      property_type: 'HOME',
      property_name: '219-PAU-HOME',
      passcode_name: null,
      lock_metadata: null,
    },
  ],
};

let server: http.Server;
let port: number;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const rawUrl = req.url ?? '';
    const parsedUrl = new URL(rawUrl, 'http://localhost');
    const pathname = parsedUrl.pathname;
    res.setHeader('Content-Type', 'application/json');

    if (pathname === '/api/v3.2/custom-data') {
      const propertyUid = parsedUrl.searchParams.get('propertyUid') ?? '';
      if (propertyUid === 'no-door-code-property') {
        res.writeHead(200);
        res.end(JSON.stringify([]));
      } else {
        res.writeHead(200);
        res.end(
          JSON.stringify([{ customDataField: { uid: '1', name: 'door_code' }, text: '1234' }]),
        );
      }
    } else if (pathname === '/rest/v1/property_locks') {
      const propertyEqParam = parsedUrl.searchParams.get('property_external_id') ?? '';
      // Strip the 'eq.' prefix added by diagnose-access.ts
      const propertyId = propertyEqParam.startsWith('eq.')
        ? propertyEqParam.slice(3)
        : propertyEqParam;
      const locks = MOCK_PROPERTY_LOCKS[propertyId] ?? [];
      res.writeHead(200);
      res.end(JSON.stringify(locks));
    } else if (pathname === '/system/smart/login') {
      // Sifely login — HTTP 200 even on auth failure, check body.code
      const username = parsedUrl.searchParams.get('username') ?? '';
      if (username === 'auth-fail-user') {
        res.writeHead(200);
        res.end(JSON.stringify({ code: -3, msg: 'token expired' }));
      } else {
        res.writeHead(200);
        res.end(JSON.stringify({ code: 200, data: { token: 'mock-token' } }));
      }
    } else if (pathname === '/v3/lock/listKeyboardPwd') {
      // Sifely list passcodes — success omits `code`, error includes it
      const lockId = parsedUrl.searchParams.get('lockId') ?? '';
      if (lockId === 'lock-error') {
        res.writeHead(200);
        res.end(JSON.stringify({ code: -2012, msg: 'gateway offline' }));
      } else {
        const passcodes = MOCK_LOCK_PASSCODES[lockId] ?? [];
        res.writeHead(200);
        res.end(JSON.stringify({ list: passcodes }));
      }
    } else if (pathname === '/v3/lockRecord/list') {
      res.writeHead(200);
      res.end(JSON.stringify({ list: [] }));
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

const BASE_ENV: Record<string, string> = {
  HOSTFULLY_API_KEY: 'test-api-key',
  SIFELY_CLIENT_ID: 'TEST_CLIENT',
  SIFELY_USERNAME: 'test-user',
  SIFELY_PASSWORD: 'test-pass',
  SUPABASE_SECRET_KEY: 'test-supabase-key',
  TENANT_ID: 'test-tenant-123',
};

function buildEnv(extras: Record<string, string> = {}): Record<string, string> {
  return {
    ...BASE_ENV,
    HOSTFULLY_API_URL: `http://localhost:${port}`,
    SIFELY_BASE_URL: `http://localhost:${port}`,
    SUPABASE_URL: `http://localhost:${port}`,
    ...extras,
  };
}

describe('diagnose-access shell tool', () => {
  it('--help exits 0 with usage containing Usage: and --property-id', async () => {
    const { stdout, code } = await runScript(['--help'], {});
    expect(code).toBe(0);
    expect(stdout).toContain('Usage:');
    expect(stdout).toContain('--property-id');
  }, 15000);

  it('missing --property-id exits 1', async () => {
    const { stderr, code } = await runScript([], buildEnv());
    expect(code).toBe(1);
    expect(stderr).toContain('--property-id');
  }, 15000);

  it('missing required env vars exits 1 and lists each missing var name', async () => {
    const { stderr, code } = await runScript(['--property-id', 'some-property'], {
      // Explicitly blank out all required vars to override any inherited env
      HOSTFULLY_API_KEY: '',
      SIFELY_CLIENT_ID: '',
      SIFELY_USERNAME: '',
      SIFELY_PASSWORD: '',
      SUPABASE_URL: '',
      SUPABASE_SECRET_KEY: '',
      TENANT_ID: '',
    });
    expect(code).toBe(1);
    expect(stderr).toContain('HOSTFULLY_API_KEY');
    expect(stderr).toContain('SIFELY_CLIENT_ID');
    expect(stderr).toContain('SIFELY_USERNAME');
    expect(stderr).toContain('SIFELY_PASSWORD');
    expect(stderr).toContain('SUPABASE_SECRET_KEY');
    expect(stderr).toContain('TENANT_ID');
  }, 15000);

  it('no lock mapping in DB returns exit 0 with empty locks array', async () => {
    const { stdout, code } = await runScript(['--property-id', 'no-lock-property'], buildEnv());
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as {
      locks: unknown[];
      hasMismatch: boolean;
      hostfullyDoorCode: string | null;
    };
    expect(data.locks).toHaveLength(0);
    expect(data.hasMismatch).toBe(false);
    expect(data.hostfullyDoorCode).toBe('1234');
  }, 15000);

  it('no door code in Hostfully returns exit 0 with hostfullyDoorCode null and empty locks', async () => {
    const { stdout, code } = await runScript(
      ['--property-id', 'no-door-code-property'],
      buildEnv(),
    );
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as {
      hostfullyDoorCode: string | null;
      locks: unknown[];
    };
    expect(data.hostfullyDoorCode).toBeNull();
    expect(data.locks).toHaveLength(0);
  }, 15000);

  it('happy path matching codes: hasMismatch false, diagnosisSummary contains match', async () => {
    const { stdout, code } = await runScript(['--property-id', 'happy-path-property'], buildEnv());
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as {
      hasMismatch: boolean;
      diagnosisSummary: string;
      locks: Array<{
        matchesHostfully: boolean;
        passcodeFound: boolean;
        expectedPasscodeName: string;
      }>;
    };
    expect(data.hasMismatch).toBe(false);
    expect(data.diagnosisSummary.toLowerCase()).toContain('match');
    expect(data.locks).toHaveLength(1);
    expect(data.locks[0].matchesHostfully).toBe(true);
    expect(data.locks[0].passcodeFound).toBe(true);
    expect(data.locks[0].expectedPasscodeName).toBe('permanent-visitor-home');
  }, 15000);

  it('mismatch different codes: hasMismatch true, summary mentions MISMATCH', async () => {
    const { stdout, code } = await runScript(['--property-id', 'mismatch-property'], buildEnv());
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as {
      hasMismatch: boolean;
      diagnosisSummary: string;
      locks: Array<{ matchesHostfully: boolean; passcodeFound: boolean }>;
    };
    expect(data.hasMismatch).toBe(true);
    expect(data.diagnosisSummary).toContain('MISMATCH');
    expect(data.locks[0].matchesHostfully).toBe(false);
    expect(data.locks[0].passcodeFound).toBe(true);
  }, 15000);

  it('shared ROOM lock matches only permanent-visitor-room-1, not home or room-2 passcodes', async () => {
    const { stdout, code } = await runScript(['--property-id', 'room-property'], buildEnv());
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as {
      hasMismatch: boolean;
      locks: Array<{
        expectedPasscodeName: string;
        matchesHostfully: boolean;
        passcodeFound: boolean;
        matchedPasscode: { keyboardPwdName: string; keyboardPwd: string } | null;
      }>;
    };
    expect(data.locks).toHaveLength(1);
    expect(data.locks[0].expectedPasscodeName).toBe('permanent-visitor-room-1');
    expect(data.locks[0].passcodeFound).toBe(true);
    expect(data.locks[0].matchesHostfully).toBe(true);
    expect(data.locks[0].matchedPasscode?.keyboardPwdName).toBe('permanent-visitor-room-1');
    expect(data.locks[0].matchedPasscode?.keyboardPwd).toBe('1234');
    expect(data.hasMismatch).toBe(false);
  }, 15000);

  it('passcode not found: passcodeFound false and hasMismatch true', async () => {
    const { stdout, code } = await runScript(['--property-id', 'no-passcode-property'], buildEnv());
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as {
      hasMismatch: boolean;
      locks: Array<{ passcodeFound: boolean; matchesHostfully: boolean }>;
    };
    expect(data.locks).toHaveLength(1);
    expect(data.locks[0].passcodeFound).toBe(false);
    expect(data.locks[0].matchesHostfully).toBe(false);
    expect(data.hasMismatch).toBe(true);
  }, 15000);

  it('Sifely auth failure exits 1 with authentication failed in stderr', async () => {
    const { stderr, code } = await runScript(
      ['--property-id', 'auth-fail-property'],
      buildEnv({ SIFELY_USERNAME: 'auth-fail-user' }),
    );
    expect(code).toBe(1);
    expect(stderr).toContain('authentication failed');
  }, 15000);

  it('Sifely per-lock failure is non-fatal: other locks still diagnosed, exit 0', async () => {
    const { stdout, code, stderr } = await runScript(
      ['--property-id', 'multi-lock-property'],
      buildEnv(),
    );
    expect(code).toBe(0);
    expect(stderr).toContain('Warning');
    const data = JSON.parse(stdout) as {
      locks: Array<{
        lockId: string;
        passcodeFound: boolean;
        matchesHostfully: boolean;
        error?: string;
      }>;
      hasMismatch: boolean;
    };
    expect(data.locks).toHaveLength(2);
    const errorLock = data.locks.find((l) => l.lockId === 'lock-error');
    const goodLock = data.locks.find((l) => l.lockId === 'lock-good');
    expect(errorLock).toBeDefined();
    expect(errorLock?.error).toBeDefined();
    expect(goodLock?.matchesHostfully).toBe(true);
    expect(goodLock?.passcodeFound).toBe(true);
  }, 15000);
});
