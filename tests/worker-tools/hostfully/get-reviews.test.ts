import { execFile } from 'child_process';
import * as http from 'http';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';

const SCRIPT_PATH = path.resolve(__dirname, '../../../src/worker-tools/hostfully/get-reviews.ts');

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

const VALID_REVIEWS = [
  {
    uid: 'rev-1',
    propertyUid: 'VALID_PROPERTY',
    author: 'John Doe',
    title: 'Great stay',
    content: 'Loved it',
    rating: 5,
    date: '2026-01-10',
    source: 'VRBO',
    responseDateTimeUTC: '2026-01-15T10:00:00Z',
  },
  {
    uid: 'rev-2',
    propertyUid: 'VALID_PROPERTY',
    author: 'Jane Smith',
    title: 'Good',
    content: 'Nice place',
    rating: 3,
    date: '2026-02-01',
    source: 'BOOKING_DOT_COM',
    responseDateTimeUTC: null,
  },
  {
    uid: 'rev-3',
    propertyUid: 'VALID_PROPERTY',
    author: 'Bob Wilson',
    title: 'Disappointing',
    content: 'Had issues',
    rating: 1,
    date: '2026-03-15',
    source: 'TRIPADVISOR',
    responseDateTimeUTC: null,
  },
];

const PAGINATED_PAGE1 = [
  {
    uid: 'pag-1',
    propertyUid: 'PAGINATED_PROPERTY',
    author: 'Alice Brown',
    title: 'Great',
    content: 'Really nice',
    rating: 5,
    date: '2026-01-01',
    source: 'AIRBNB',
    responseDateTimeUTC: null,
  },
  {
    uid: 'pag-2',
    propertyUid: 'PAGINATED_PROPERTY',
    author: 'Charlie Davis',
    title: 'Good',
    content: 'Okay stay',
    rating: 4,
    date: '2026-02-01',
    source: 'VRBO',
    responseDateTimeUTC: '2026-02-05T10:00:00Z',
  },
];

const PAGINATED_PAGE2 = [
  {
    uid: 'pag-3',
    propertyUid: 'PAGINATED_PROPERTY',
    author: 'Eve Foster',
    title: 'Okay',
    content: 'Could be better',
    rating: 3,
    date: '2026-03-01',
    source: 'BOOKING_DOT_COM',
    responseDateTimeUTC: null,
  },
];

let lastSeenUpdatedSince = '';
let server: http.Server;
let port: number;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const rawUrl = req.url ?? '';
    res.setHeader('Content-Type', 'application/json');

    const parsedUrl = new URL(rawUrl, 'http://localhost');

    if (rawUrl.startsWith('/reviews?')) {
      const propertyUid = parsedUrl.searchParams.get('propertyUid') ?? '';
      const cursor = parsedUrl.searchParams.get('_cursor') ?? '';
      const updatedSince = parsedUrl.searchParams.get('updatedSince');
      if (updatedSince) {
        lastSeenUpdatedSince = updatedSince;
      }

      if (propertyUid === 'VALID_PROPERTY') {
        res.writeHead(200);
        res.end(JSON.stringify({ reviews: VALID_REVIEWS, _paging: {} }));
      } else if (propertyUid === 'EMPTY_PROPERTY') {
        res.writeHead(200);
        res.end(JSON.stringify({ reviews: [], _paging: {} }));
      } else if (propertyUid === 'PAGINATED_PROPERTY') {
        if (!cursor) {
          res.writeHead(200);
          res.end(
            JSON.stringify({
              reviews: PAGINATED_PAGE1,
              _paging: { _nextCursor: 'page2' },
            }),
          );
        } else if (cursor === 'page2') {
          res.writeHead(200);
          res.end(JSON.stringify({ reviews: PAGINATED_PAGE2, _paging: {} }));
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
    } else if (rawUrl.startsWith('/properties?')) {
      const agencyUid = parsedUrl.searchParams.get('agencyUid') ?? '';

      if (agencyUid === 'VALID_AGENCY') {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            properties: [{ uid: 'VALID_PROPERTY' }, { uid: 'EMPTY_PROPERTY' }],
            _paging: {},
          }),
        );
      } else if (agencyUid === 'MIXED_AGENCY') {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            properties: [{ uid: 'VALID_PROPERTY' }, { uid: 'ERROR_PROPERTY' }],
            _paging: {},
          }),
        );
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
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

describe('get-reviews shell tool', () => {
  it('output shape has all 10 fields; rev-1 has hasResponse true, rev-2 has hasResponse false', async () => {
    const { stdout, code } = await runScript(['--property-id', 'VALID_PROPERTY'], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as Record<string, unknown>[];
    expect(data).toHaveLength(3);

    const rev1 = data.find((r) => r.uid === 'rev-1');
    expect(rev1).toBeDefined();
    expect(rev1).toHaveProperty('uid', 'rev-1');
    expect(rev1).toHaveProperty('propertyUid', 'VALID_PROPERTY');
    expect(rev1).toHaveProperty('guestName', 'John Doe');
    expect(rev1).toHaveProperty('title', 'Great stay');
    expect(rev1).toHaveProperty('content', 'Loved it');
    expect(rev1).toHaveProperty('rating', 5);
    expect(rev1).toHaveProperty('date', '2026-01-10');
    expect(rev1).toHaveProperty('source', 'VRBO');
    expect(rev1).toHaveProperty('hasResponse', true);
    expect(rev1).toHaveProperty('responseDateTimeUTC', '2026-01-15T10:00:00Z');

    const rev2 = data.find((r) => r.uid === 'rev-2');
    expect(rev2).toBeDefined();
    expect(rev2).toHaveProperty('hasResponse', false);
    expect(rev2).toHaveProperty('responseDateTimeUTC', null);
  });

  it('--unresponded-only returns only reviews without a response', async () => {
    const { stdout, code } = await runScript(
      ['--property-id', 'VALID_PROPERTY', '--unresponded-only'],
      { HOSTFULLY_API_KEY: 'testkey', HOSTFULLY_API_URL: `http://localhost:${port}` },
    );
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as { uid: string; responseDateTimeUTC: string | null }[];
    expect(data).toHaveLength(2);
    const uids = data.map((r) => r.uid);
    expect(uids).toContain('rev-2');
    expect(uids).toContain('rev-3');
    expect(uids).not.toContain('rev-1');
    for (const r of data) {
      expect(r.responseDateTimeUTC).toBeNull();
    }
  });

  it('--since passes updatedSince query param to the API', async () => {
    lastSeenUpdatedSince = '';
    const { code } = await runScript(['--property-id', 'VALID_PROPERTY', '--since', '2026-01-01'], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    expect(lastSeenUpdatedSince).toBe('2026-01-01');
  });

  it('empty property returns empty array with exit code 0', async () => {
    const { stdout, code } = await runScript(['--property-id', 'EMPTY_PROPERTY'], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as unknown[];
    expect(data).toEqual([]);
  });

  it('API error (500) on single property exits 1 with non-empty stderr', async () => {
    const { stderr, code } = await runScript(['--property-id', 'ERROR_PROPERTY'], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(1);
    expect(stderr.length).toBeGreaterThan(0);
  });

  it('exits 1 when HOSTFULLY_AGENCY_UID is missing (portfolio mode)', async () => {
    const { stderr, code } = await runScript([], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_AGENCY_UID: '',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(1);
    expect(stderr).toContain('HOSTFULLY_AGENCY_UID');
  });

  it('exits 1 when HOSTFULLY_API_KEY is missing', async () => {
    const { stderr, code } = await runScript(['--property-id', 'VALID_PROPERTY'], {
      HOSTFULLY_API_KEY: '',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(1);
    expect(stderr).toContain('HOSTFULLY_API_KEY');
  });

  it('--help exits 0 with usage including all flags', async () => {
    const { stdout, code } = await runScript(['--help'], {});
    expect(code).toBe(0);
    expect(stdout).toContain('--property-id');
    expect(stdout).toContain('--since');
    expect(stdout).toContain('--unresponded-only');
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

  it('portfolio-wide success returns all reviews across properties', async () => {
    const { stdout, code } = await runScript([], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_AGENCY_UID: 'VALID_AGENCY',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as { uid: string }[];
    expect(data).toHaveLength(3);
    const uids = data.map((r) => r.uid);
    expect(uids).toContain('rev-1');
    expect(uids).toContain('rev-2');
    expect(uids).toContain('rev-3');
  });

  it('portfolio-wide mixed: continues on per-property error, warns in stderr', async () => {
    const { stdout, stderr, code } = await runScript([], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_AGENCY_UID: 'MIXED_AGENCY',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    expect(stderr).toContain('Warning');
    const data = JSON.parse(stdout) as { uid: string; propertyUid: string }[];
    const uids = data.map((r) => r.uid);
    expect(uids).toContain('rev-1');
    expect(uids).toContain('rev-2');
    expect(uids).toContain('rev-3');
    const propertyUids = data.map((r) => r.propertyUid);
    expect(propertyUids).not.toContain('ERROR_PROPERTY');
  });

  it('portfolio --unresponded-only filters across all properties', async () => {
    const { stdout, code } = await runScript(['--unresponded-only'], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_AGENCY_UID: 'VALID_AGENCY',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as { uid: string; responseDateTimeUTC: string | null }[];
    expect(data).toHaveLength(2);
    const uids = data.map((r) => r.uid);
    expect(uids).toContain('rev-2');
    expect(uids).toContain('rev-3');
    expect(uids).not.toContain('rev-1');
    for (const r of data) {
      expect(r.responseDateTimeUTC).toBeNull();
    }
  });
});
