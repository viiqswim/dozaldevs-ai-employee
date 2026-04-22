import { execFile } from 'child_process';
import * as http from 'http';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';

const SCRIPT_PATH = path.resolve(
  __dirname,
  '../../../dist/worker-tools/hostfully/get-properties.js',
);

function runScript(
  args: string[],
  env: Record<string, string>,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      'node',
      [SCRIPT_PATH, ...args],
      { env: { ...process.env, ...env } },
      (err, stdout, stderr) => {
        resolve({ stdout, stderr, code: err ? ((err.code as number) ?? 1) : 0 });
      },
    );
  });
}

let server: http.Server;
let port: number;

const PAGE1_PROPS = [
  {
    uid: 'PROP_001',
    name: 'Property One',
    propertyType: 'CABIN',
    address: { city: 'Denver', state: 'CO' },
    bedrooms: 3,
    availability: { maxGuests: 8 },
    isActive: true,
  },
  {
    uid: 'PROP_002',
    name: 'Property Two',
    propertyType: 'APARTMENT',
    address: { city: 'Boulder', state: 'CO' },
    bedrooms: 2,
    availability: { maxGuests: 4 },
    isActive: true,
  },
];

const PAGE2_PROPS = [
  {
    uid: 'PROP_003',
    name: 'Property Three',
    propertyType: 'HOUSE',
    address: { city: 'Aspen', state: 'CO' },
    bedrooms: 4,
    availability: { maxGuests: 10 },
    isActive: false,
  },
  {
    uid: 'PROP_004',
    name: 'Property Four',
    propertyType: 'CONDO',
    address: { city: 'Vail', state: 'CO' },
    bedrooms: 1,
    availability: { maxGuests: 2 },
    isActive: true,
  },
];

const LOOP_PROPS = [
  {
    uid: 'LOOP_001',
    name: 'Loop Property One',
    propertyType: 'CABIN',
    address: { city: 'Denver', state: 'CO' },
    bedrooms: 2,
    availability: { maxGuests: 4 },
    isActive: true,
  },
  {
    uid: 'LOOP_002',
    name: 'Loop Property Two',
    propertyType: 'HOUSE',
    address: { city: 'Boulder', state: 'CO' },
    bedrooms: 3,
    availability: { maxGuests: 6 },
    isActive: true,
  },
];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const rawUrl = req.url ?? '';
    res.setHeader('Content-Type', 'application/json');

    if (!rawUrl.startsWith('/properties?')) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    const parsedUrl = new URL(rawUrl, 'http://localhost');
    const agencyUid = parsedUrl.searchParams.get('agencyUid') ?? '';
    const cursor = parsedUrl.searchParams.get('cursor') ?? '';

    if (agencyUid === 'EMPTY_AGENCY') {
      res.writeHead(200);
      res.end(JSON.stringify({ properties: [], _paging: {} }));
    } else if (agencyUid === 'TEST_AGENCY' && !cursor) {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          properties: PAGE1_PROPS,
          _paging: { _nextCursor: 'PAGE2_CURSOR' },
        }),
      );
    } else if (agencyUid === 'TEST_AGENCY' && cursor === 'PAGE2_CURSOR') {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          properties: PAGE2_PROPS,
          _paging: {},
        }),
      );
    } else if (agencyUid === 'ERROR_AGENCY') {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Internal server error' }));
    } else if (agencyUid === 'LOOP_AGENCY') {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          properties: LOOP_PROPS,
          _paging: { _nextCursor: 'LOOP_CURSOR' },
        }),
      );
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

describe('get-properties shell tool', () => {
  it('happy path — empty agency returns empty array', async () => {
    const { stdout, code } = await runScript([], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_AGENCY_UID: 'EMPTY_AGENCY',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as unknown[];
    expect(data).toEqual([]);
  });

  it('happy path — two pages returns all 4 properties', async () => {
    const { stdout, code } = await runScript([], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_AGENCY_UID: 'TEST_AGENCY',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as { uid: string }[];
    expect(data).toHaveLength(4);
    const uids = data.map((p) => p.uid);
    expect(uids).toContain('PROP_001');
    expect(uids).toContain('PROP_002');
    expect(uids).toContain('PROP_003');
    expect(uids).toContain('PROP_004');
  });

  it('dedup guard — cursor loop returns exactly 2 properties and stops', async () => {
    const { stdout, code } = await runScript([], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_AGENCY_UID: 'LOOP_AGENCY',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as { uid: string }[];
    expect(data).toHaveLength(2);
    expect(data[0].uid).toBe('LOOP_001');
    expect(data[1].uid).toBe('LOOP_002');
  });

  it('exits 1 when HOSTFULLY_API_KEY is missing', async () => {
    const { stderr, code } = await runScript([], {
      HOSTFULLY_API_KEY: '',
      HOSTFULLY_AGENCY_UID: 'TEST_AGENCY',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(1);
    expect(stderr).toContain('HOSTFULLY_API_KEY');
  });

  it('exits 1 when HOSTFULLY_AGENCY_UID is missing', async () => {
    const { stderr, code } = await runScript([], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_AGENCY_UID: '',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(1);
    expect(stderr).toContain('HOSTFULLY_AGENCY_UID');
  });

  it('--help flag exits 0 with usage text', async () => {
    const { stdout, code } = await runScript(['--help'], {});
    expect(code).toBe(0);
    expect(stdout).toContain('--help');
    expect(stdout).toContain('Usage');
  });

  it('API error (500) exits 1 with error message', async () => {
    const { stderr, code } = await runScript([], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_AGENCY_UID: 'ERROR_AGENCY',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(1);
    expect(stderr.length).toBeGreaterThan(0);
    expect(stderr).toContain('500');
  });

  it('output shape has all 8 curated fields', async () => {
    const { stdout, code } = await runScript([], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_AGENCY_UID: 'TEST_AGENCY',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as Record<string, unknown>[];
    expect(data.length).toBeGreaterThan(0);
    const prop = data[0];
    expect(prop).toHaveProperty('uid');
    expect(prop).toHaveProperty('name');
    expect(prop).toHaveProperty('propertyType');
    expect(prop).toHaveProperty('city');
    expect(prop).toHaveProperty('state');
    expect(prop).toHaveProperty('bedrooms');
    expect(prop).toHaveProperty('maxGuests');
    expect(prop).toHaveProperty('isActive');
  });
});
