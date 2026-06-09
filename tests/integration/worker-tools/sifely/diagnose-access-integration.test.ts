import { execFile } from 'child_process';
import * as http from 'node:http';
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import path from 'path';

const SCRIPT_PATH = path.resolve(__dirname, '../../../../src/worker-tools/sifely/diagnose-access.ts');

const VLRE_TENANT_ID = '00000000-0000-0000-0000-000000000003';

const HAPPY_PROPERTY_ID = 'integ-test-property-happy';
const NO_MAPPING_PROPERTY_ID = 'integ-test-property-nomapping';

const LOCK_ID_HAPPY = 'integ-lock-happy';
const LOCK_ID_MISMATCH = 'integ-lock-mismatch';

const SIFELY_PASSCODES: Record<string, unknown[]> = {
  [LOCK_ID_HAPPY]: [
    {
      keyboardPwdId: 1001,
      keyboardPwd: '1234',
      keyboardPwdName: 'permanent-visitor-home',
      keyboardPwdType: 2,
      startDate: 0,
      endDate: 0,
      status: 1,
    },
  ],
  [LOCK_ID_MISMATCH]: [
    {
      keyboardPwdId: 1002,
      keyboardPwd: '5678',
      keyboardPwdName: 'permanent-visitor-home',
      keyboardPwdType: 2,
      startDate: 0,
      endDate: 0,
      status: 1,
    },
  ],
};

const postgrestData: Record<string, unknown[]> = {};

const prisma = new PrismaClient();
let server: http.Server;
let port: number;

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

function buildEnv(): Record<string, string> {
  return {
    HOSTFULLY_API_KEY: 'integ-test-api-key',
    HOSTFULLY_API_URL: `http://localhost:${port}`,
    SIFELY_CLIENT_ID: 'VLRE',
    SIFELY_USERNAME: 'test@test.com',
    SIFELY_PASSWORD: 'testpass',
    SIFELY_BASE_URL: `http://localhost:${port}`,
    SUPABASE_URL: `http://localhost:${port}`,
    SUPABASE_SECRET_KEY: 'integ-test-supabase-key',
    TENANT_ID: VLRE_TENANT_ID,
  };
}

async function cleanupTestLocks(): Promise<void> {
  await prisma.propertyLock.deleteMany({
    where: {
      property_external_id: { in: [HAPPY_PROPERTY_ID, NO_MAPPING_PROPERTY_ID] },
    },
  });
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const rawUrl = req.url ?? '';
    const parsedUrl = new URL(rawUrl, 'http://localhost');
    const pathname = parsedUrl.pathname;
    res.setHeader('Content-Type', 'application/json');

    if (pathname === '/api/v3.2/custom-data') {
      res.writeHead(200);
      res.end(JSON.stringify([{ customDataField: { uid: '1', name: 'door_code' }, text: '1234' }]));
      return;
    }

    if (pathname === '/rest/v1/property_locks') {
      const propertyEqParam = parsedUrl.searchParams.get('property_external_id') ?? '';
      const propertyId = propertyEqParam.startsWith('eq.')
        ? propertyEqParam.slice(3)
        : propertyEqParam;
      const locks = postgrestData[propertyId] ?? [];
      res.writeHead(200);
      res.end(JSON.stringify(locks));
      return;
    }

    if (pathname === '/system/smart/login') {
      res.writeHead(200);
      res.end(JSON.stringify({ code: 200, data: { token: 'integ-mock-token' } }));
      return;
    }

    if (pathname === '/v3/lock/listKeyboardPwd') {
      const lockId = parsedUrl.searchParams.get('lockId') ?? '';
      const passcodes = SIFELY_PASSCODES[lockId] ?? [];
      res.writeHead(200);
      res.end(JSON.stringify({ list: passcodes }));
      return;
    }

    if (pathname === '/v3/lockRecord/list') {
      res.writeHead(200);
      res.end(JSON.stringify({ list: [] }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: `Not found: ${pathname}` }));
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as { port: number }).port;
});

afterAll(async () => {
  await cleanupTestLocks();
  await prisma.$disconnect();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

beforeEach(async () => {
  await cleanupTestLocks();
  delete postgrestData[HAPPY_PROPERTY_ID];
  delete postgrestData[NO_MAPPING_PROPERTY_ID];
});

afterEach(async () => {
  await cleanupTestLocks();
});

describe('diagnose-access integration (real test DB + mock APIs)', () => {
  it('happy path — codes match → hasMismatch false, passcodeFound true', async () => {
    const inserted = await prisma.propertyLock.create({
      data: {
        tenant_id: VLRE_TENANT_ID,
        property_external_id: HAPPY_PROPERTY_ID,
        lock_external_id: LOCK_ID_HAPPY,
        lock_name: 'Front Door',
        lock_provider: 'sifely',
        property_type: 'HOME',
        property_name: '219-PAU-HOME',
      },
    });

    postgrestData[HAPPY_PROPERTY_ID] = [
      {
        id: inserted.id,
        tenant_id: inserted.tenant_id,
        property_external_id: inserted.property_external_id,
        lock_external_id: inserted.lock_external_id,
        lock_name: inserted.lock_name,
        lock_provider: inserted.lock_provider,
        lock_role: inserted.lock_role,
        property_type: inserted.property_type,
        property_name: inserted.property_name,
        passcode_name: inserted.passcode_name,
        lock_metadata: inserted.lock_metadata,
      },
    ];

    const { stdout, code } = await runScript(['--property-id', HAPPY_PROPERTY_ID], buildEnv());

    expect(code).toBe(0);

    const data = JSON.parse(stdout) as {
      hasMismatch: boolean;
      hostfullyDoorCode: string | null;
      diagnosisSummary: string;
      locks: Array<{
        lockId: string;
        matchesHostfully: boolean;
        passcodeFound: boolean;
        expectedPasscodeName: string;
      }>;
    };

    expect(data.hasMismatch).toBe(false);
    expect(data.hostfullyDoorCode).toBe('1234');
    expect(data.locks).toHaveLength(1);
    expect(data.locks[0].lockId).toBe(LOCK_ID_HAPPY);
    expect(data.locks[0].passcodeFound).toBe(true);
    expect(data.locks[0].matchesHostfully).toBe(true);
    expect(data.locks[0].expectedPasscodeName).toBe('permanent-visitor-home');
    expect(data.diagnosisSummary.toLowerCase()).toContain('match');
  }, 30000);

  it('mismatch — Sifely code differs from Hostfully → hasMismatch true, matchesHostfully false', async () => {
    const inserted = await prisma.propertyLock.create({
      data: {
        tenant_id: VLRE_TENANT_ID,
        property_external_id: HAPPY_PROPERTY_ID,
        lock_external_id: LOCK_ID_MISMATCH,
        lock_name: 'Front Door',
        lock_provider: 'sifely',
        property_type: 'HOME',
        property_name: '219-PAU-HOME',
      },
    });

    postgrestData[HAPPY_PROPERTY_ID] = [
      {
        id: inserted.id,
        tenant_id: inserted.tenant_id,
        property_external_id: inserted.property_external_id,
        lock_external_id: inserted.lock_external_id,
        lock_name: inserted.lock_name,
        lock_provider: inserted.lock_provider,
        lock_role: inserted.lock_role,
        property_type: inserted.property_type,
        property_name: inserted.property_name,
        passcode_name: inserted.passcode_name,
        lock_metadata: inserted.lock_metadata,
      },
    ];

    const { stdout, code } = await runScript(['--property-id', HAPPY_PROPERTY_ID], buildEnv());

    expect(code).toBe(0);

    const data = JSON.parse(stdout) as {
      hasMismatch: boolean;
      diagnosisSummary: string;
      locks: Array<{
        matchesHostfully: boolean;
        passcodeFound: boolean;
      }>;
    };

    expect(data.hasMismatch).toBe(true);
    expect(data.diagnosisSummary).toContain('MISMATCH');
    expect(data.locks).toHaveLength(1);
    expect(data.locks[0].passcodeFound).toBe(true);
    expect(data.locks[0].matchesHostfully).toBe(false);
  }, 30000);

  it('no lock mapping → exit 0 with empty locks array, hasMismatch false', async () => {
    postgrestData[NO_MAPPING_PROPERTY_ID] = [];

    const { stdout, code } = await runScript(['--property-id', NO_MAPPING_PROPERTY_ID], buildEnv());

    expect(code).toBe(0);

    const data = JSON.parse(stdout) as {
      locks: unknown[];
      hasMismatch: boolean;
      diagnosisSummary: string;
    };

    expect(data.locks).toHaveLength(0);
    expect(data.hasMismatch).toBe(false);
    expect(data.diagnosisSummary.toLowerCase()).toContain('no lock');
  }, 30000);
});
