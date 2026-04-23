import { execFile } from 'child_process';
import * as http from 'http';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';

const SCRIPT_PATH = path.resolve(
  __dirname,
  '../../../src/worker-tools/hostfully/get-reservations.ts',
);

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

const VALID_LEADS = [
  {
    uid: 'lead-1',
    propertyUid: 'VALID_PROPERTY',
    type: 'BOOKING',
    status: 'BOOKED',
    channel: 'AIRBNB',
    source: 'DIRECT_AIRBNB',
    checkInLocalDateTime: '2026-05-01T16:00:00',
    checkOutLocalDateTime: '2026-05-05T11:00:00',
    guestInformation: { firstName: 'John', lastName: 'Doe', adultCount: 2, childrenCount: 1 },
  },
  {
    uid: 'lead-2',
    propertyUid: 'VALID_PROPERTY',
    type: 'BOOKING',
    status: 'CANCELLED',
    channel: 'VRBO',
    source: 'DIRECT_VRBO',
    checkInLocalDateTime: '2026-05-10T16:00:00',
    checkOutLocalDateTime: '2026-05-12T11:00:00',
    guestInformation: { firstName: 'Jane', lastName: 'Smith', adultCount: 1, childrenCount: 0 },
  },
  {
    uid: 'lead-3',
    propertyUid: 'VALID_PROPERTY',
    type: 'BLOCK',
    status: 'BLOCKED',
    channel: 'HOSTFULLY',
    source: 'HOSTFULLY_UI',
    checkInLocalDateTime: '2026-06-01T16:00:00',
    checkOutLocalDateTime: '2026-06-05T11:00:00',
    guestInformation: { firstName: null, lastName: null, adultCount: 1, childrenCount: 0 },
  },
  {
    uid: 'lead-4',
    propertyUid: 'VALID_PROPERTY',
    type: 'INQUIRY',
    status: 'CLOSED',
    channel: 'AIRBNB',
    source: 'DIRECT_AIRBNB',
    checkInLocalDateTime: '2026-04-10T16:00:00',
    checkOutLocalDateTime: '2026-04-15T11:00:00',
    guestInformation: { firstName: 'Bob', lastName: 'Wilson', adultCount: 3, childrenCount: 0 },
  },
];

const PAGINATED_PAGE1 = [
  {
    uid: 'pag-1',
    propertyUid: 'PAGINATED_PROPERTY',
    type: 'BOOKING',
    status: 'BOOKED',
    channel: 'AIRBNB',
    source: 'DIRECT_AIRBNB',
    checkInLocalDateTime: '2026-05-01T16:00:00',
    checkOutLocalDateTime: '2026-05-05T11:00:00',
    guestInformation: { firstName: 'Alice', lastName: 'Brown', adultCount: 2, childrenCount: 0 },
  },
  {
    uid: 'pag-2',
    propertyUid: 'PAGINATED_PROPERTY',
    type: 'BOOKING',
    status: 'BOOKED',
    channel: 'VRBO',
    source: 'DIRECT_VRBO',
    checkInLocalDateTime: '2026-05-10T16:00:00',
    checkOutLocalDateTime: '2026-05-14T11:00:00',
    guestInformation: { firstName: 'Charlie', lastName: 'Davis', adultCount: 1, childrenCount: 0 },
  },
];

const PAGINATED_PAGE2 = [
  {
    uid: 'pag-3',
    propertyUid: 'PAGINATED_PROPERTY',
    type: 'BOOKING',
    status: 'STAY',
    channel: 'HOSTFULLY',
    source: 'HOSTFULLY_API',
    checkInLocalDateTime: '2026-04-20T16:00:00',
    checkOutLocalDateTime: '2026-04-25T11:00:00',
    guestInformation: { firstName: 'Eve', lastName: 'Foster', adultCount: 4, childrenCount: 2 },
  },
];

let server: http.Server;
let port: number;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const rawUrl = req.url ?? '';
    res.setHeader('Content-Type', 'application/json');

    if (!rawUrl.startsWith('/leads?')) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    const parsedUrl = new URL(rawUrl, 'http://localhost');
    const propertyUid = parsedUrl.searchParams.get('propertyUid') ?? '';
    const cursor = parsedUrl.searchParams.get('_cursor') ?? '';

    if (propertyUid === 'VALID_PROPERTY') {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          leads: VALID_LEADS,
          _metadata: { count: 4, totalCount: null },
          _paging: { _limit: 20 },
        }),
      );
    } else if (propertyUid === 'EMPTY_PROPERTY') {
      res.writeHead(200);
      res.end(JSON.stringify({ leads: [], _metadata: { count: 0 }, _paging: {} }));
    } else if (propertyUid === 'PAGINATED_PROPERTY') {
      if (!cursor) {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            leads: PAGINATED_PAGE1,
            _metadata: { count: 2, totalCount: null },
            _paging: { _limit: 2, _nextCursor: 'page2' },
          }),
        );
      } else if (cursor === 'page2') {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            leads: PAGINATED_PAGE2,
            _metadata: { count: 1, totalCount: null },
            _paging: {},
          }),
        );
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Unknown cursor' }));
      }
    } else if (propertyUid === 'ERROR_PROPERTY') {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Internal server error' }));
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

describe('get-reservations shell tool', () => {
  it('default filter (no --status) returns only BOOKING type leads', async () => {
    const { stdout, code } = await runScript(['--property-id', 'VALID_PROPERTY'], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as { uid: string; type?: string }[];
    const uids = data.map((r) => r.uid);
    expect(uids).toContain('lead-1');
    expect(uids).toContain('lead-2');
    expect(uids).not.toContain('lead-3');
    expect(uids).not.toContain('lead-4');
  });

  it('--status confirmed returns only confirmed BOOKING leads', async () => {
    const { stdout, code } = await runScript(
      ['--property-id', 'VALID_PROPERTY', '--status', 'confirmed'],
      { HOSTFULLY_API_KEY: 'testkey', HOSTFULLY_API_URL: `http://localhost:${port}` },
    );
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as { uid: string }[];
    const uids = data.map((r) => r.uid);
    expect(uids).toContain('lead-1');
    expect(uids).not.toContain('lead-2');
    expect(uids).not.toContain('lead-3');
    expect(uids).not.toContain('lead-4');
  });

  it('--status cancelled returns only cancelled leads', async () => {
    const { stdout, code } = await runScript(
      ['--property-id', 'VALID_PROPERTY', '--status', 'cancelled'],
      { HOSTFULLY_API_KEY: 'testkey', HOSTFULLY_API_URL: `http://localhost:${port}` },
    );
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as { uid: string }[];
    const uids = data.map((r) => r.uid);
    expect(uids).not.toContain('lead-1');
    expect(uids).toContain('lead-2');
    expect(uids).not.toContain('lead-3');
    expect(uids).not.toContain('lead-4');
  });

  it('--status inquiry returns only INQUIRY type leads', async () => {
    const { stdout, code } = await runScript(
      ['--property-id', 'VALID_PROPERTY', '--status', 'inquiry'],
      { HOSTFULLY_API_KEY: 'testkey', HOSTFULLY_API_URL: `http://localhost:${port}` },
    );
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as { uid: string }[];
    const uids = data.map((r) => r.uid);
    expect(uids).not.toContain('lead-1');
    expect(uids).not.toContain('lead-2');
    expect(uids).not.toContain('lead-3');
    expect(uids).toContain('lead-4');
  });

  it('empty property returns empty array', async () => {
    const { stdout, code } = await runScript(['--property-id', 'EMPTY_PROPERTY'], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as unknown[];
    expect(data).toEqual([]);
  });

  it('exits 1 when --property-id is missing', async () => {
    const { stderr, code } = await runScript([], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(1);
    expect(stderr).toContain('--property-id');
  });

  it('exits 1 when HOSTFULLY_API_KEY is missing', async () => {
    const { stderr, code } = await runScript(['--property-id', 'VALID_PROPERTY'], {
      HOSTFULLY_API_KEY: '',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(1);
    expect(stderr).toContain('HOSTFULLY_API_KEY');
  });

  it('API error (500) exits 1 with non-empty stderr', async () => {
    const { stderr, code } = await runScript(['--property-id', 'ERROR_PROPERTY'], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(1);
    expect(stderr.length).toBeGreaterThan(0);
  });

  it('--help exits 0 with usage including all flags', async () => {
    const { stdout, code } = await runScript(['--help'], {});
    expect(code).toBe(0);
    expect(stdout).toContain('--property-id');
    expect(stdout).toContain('--status');
    expect(stdout).toContain('--from');
    expect(stdout).toContain('--to');
  });

  it('pagination combines results from both pages', async () => {
    const { stdout, code } = await runScript(['--property-id', 'PAGINATED_PROPERTY'], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as { uid: string }[];
    expect(data).toHaveLength(3);
    const uids = data.map((r) => r.uid);
    expect(uids).toContain('pag-1');
    expect(uids).toContain('pag-2');
    expect(uids).toContain('pag-3');
  });

  it('output shape has all 8 curated fields with correct computed values for lead-1', async () => {
    const { stdout, code } = await runScript(['--property-id', 'VALID_PROPERTY'], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as Record<string, unknown>[];
    const lead1 = data.find((r) => r.uid === 'lead-1');
    expect(lead1).toBeDefined();
    expect(lead1).toHaveProperty('uid', 'lead-1');
    expect(lead1).toHaveProperty('propertyUid', 'VALID_PROPERTY');
    expect(lead1).toHaveProperty('guestName', 'John Doe');
    expect(lead1).toHaveProperty('checkIn', '2026-05-01T16:00:00');
    expect(lead1).toHaveProperty('checkOut', '2026-05-05T11:00:00');
    expect(lead1).toHaveProperty('channel', 'AIRBNB');
    expect(lead1).toHaveProperty('numberOfGuests', 3);
    expect(lead1).toHaveProperty('status', 'BOOKED');
  });
});
