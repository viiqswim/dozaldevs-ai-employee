import { execFile } from 'child_process';
import * as http from 'http';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';

const SCRIPT_PATH = path.resolve(__dirname, '../../../src/worker-tools/hostfully/get-messages.ts');

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
    guestInformation: { firstName: 'John', lastName: 'Doe' },
  },
  {
    uid: 'lead-2',
    propertyUid: 'VALID_PROPERTY',
    type: 'BOOKING',
    status: 'BOOKED',
    channel: 'VRBO',
    guestInformation: { firstName: 'Jane', lastName: 'Smith' },
  },
  {
    uid: 'lead-3',
    propertyUid: 'VALID_PROPERTY',
    type: 'BLOCK',
    status: 'BLOCKED',
    channel: 'HOSTFULLY',
    guestInformation: { firstName: null, lastName: null },
  },
];

const ZERO_MSG_LEADS = [
  {
    uid: 'zero-lead',
    propertyUid: 'ZERO_MSG_PROPERTY',
    type: 'BOOKING',
    status: 'BOOKED',
    channel: 'AIRBNB',
    guestInformation: { firstName: 'Ghost', lastName: 'User' },
  },
];

const ALL_RESPONDED_LEADS = [
  {
    uid: 'resp-lead-1',
    propertyUid: 'ALL_RESPONDED_PROPERTY',
    type: 'BOOKING',
    status: 'BOOKED',
    channel: 'VRBO',
    guestInformation: { firstName: 'Alice', lastName: 'Brown' },
  },
];

/*
 * LIVE API shape (confirmed 2026-04-22 against api.hostfully.com/api/v3.2/messages):
 *   { messages: [...], _metadata: { count: N, totalCount: null }, _paging: { _limit: N, _nextCursor: "..." } }
 * Each message: { uid, createdUtcDateTime, status, type (channel), senderType ("GUEST"|"AGENCY"), content: { subject, text }, threadUid, attachments }
 * Sort order from API: newest-first. We sort client-side to oldest-first.
 */

const MESSAGES_LEAD_1 = {
  messages: [
    {
      uid: 'msg-1c',
      leadUid: 'lead-1',
      createdUtcDateTime: '2026-04-20T11:00:00Z',
      status: 'CREATED',
      type: 'AIRBNB',
      senderType: 'GUEST',
      content: { subject: null, text: 'Thanks! Any parking info?' },
      threadUid: 'thread-1',
      attachments: [],
    },
    {
      uid: 'msg-1b',
      leadUid: 'lead-1',
      createdUtcDateTime: '2026-04-20T10:30:00Z',
      status: 'SENT',
      type: 'AIRBNB',
      senderType: 'AGENCY',
      content: { subject: null, text: 'Check-in is at 3pm!' },
      threadUid: 'thread-1',
      attachments: [],
    },
    {
      uid: 'msg-1a',
      leadUid: 'lead-1',
      createdUtcDateTime: '2026-04-20T10:00:00Z',
      status: 'CREATED',
      type: 'AIRBNB',
      senderType: 'GUEST',
      content: { subject: null, text: 'What time is check-in?' },
      threadUid: 'thread-1',
      attachments: [],
    },
  ],
  _metadata: { count: 3, totalCount: null },
  _paging: { _limit: 30 },
};

const MESSAGES_LEAD_2 = {
  messages: [
    {
      uid: 'msg-2b',
      leadUid: 'lead-2',
      createdUtcDateTime: '2026-04-19T09:30:00Z',
      status: 'SENT',
      type: 'VRBO',
      senderType: 'AGENCY',
      content: { subject: null, text: 'No breakfast, but there is a full kitchen!' },
      threadUid: 'thread-2',
      attachments: [],
    },
    {
      uid: 'msg-2a',
      leadUid: 'lead-2',
      createdUtcDateTime: '2026-04-19T09:00:00Z',
      status: 'CREATED',
      type: 'VRBO',
      senderType: 'GUEST',
      content: { subject: null, text: 'Is breakfast included?' },
      threadUid: 'thread-2',
      attachments: [],
    },
  ],
  _metadata: { count: 2, totalCount: null },
  _paging: { _limit: 30 },
};

let server: http.Server;
let port: number;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const rawUrl = req.url ?? '';
    res.setHeader('Content-Type', 'application/json');
    const parsedUrl = new URL(rawUrl, 'http://localhost');

    if (rawUrl.startsWith('/leads?')) {
      const propertyUid = parsedUrl.searchParams.get('propertyUid') ?? '';

      if (propertyUid === 'VALID_PROPERTY') {
        res.writeHead(200);
        res.end(JSON.stringify({ leads: VALID_LEADS, _metadata: { count: 3 }, _paging: {} }));
      } else if (propertyUid === 'EMPTY_PROPERTY') {
        res.writeHead(200);
        res.end(JSON.stringify({ leads: [], _metadata: { count: 0 }, _paging: {} }));
      } else if (propertyUid === 'ZERO_MSG_PROPERTY') {
        res.writeHead(200);
        res.end(JSON.stringify({ leads: ZERO_MSG_LEADS, _metadata: { count: 1 }, _paging: {} }));
      } else if (propertyUid === 'ALL_RESPONDED_PROPERTY') {
        res.writeHead(200);
        res.end(
          JSON.stringify({ leads: ALL_RESPONDED_LEADS, _metadata: { count: 1 }, _paging: {} }),
        );
      } else if (propertyUid === 'ERROR_PROPERTY') {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Internal server error' }));
      } else if (propertyUid === 'LIMIT_TEST_PROPERTY') {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            leads: [
              {
                uid: 'limit-lead',
                propertyUid: 'LIMIT_TEST_PROPERTY',
                type: 'BOOKING',
                status: 'BOOKED',
                channel: 'AIRBNB',
                guestInformation: { firstName: 'Limit', lastName: 'Test' },
              },
            ],
            _metadata: { count: 1 },
            _paging: {},
          }),
        );
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } else if (rawUrl.startsWith('/messages?')) {
      const leadUid = parsedUrl.searchParams.get('leadUid') ?? '';
      const limit = parsedUrl.searchParams.get('_limit') ?? '30';

      if (leadUid === 'lead-1') {
        res.writeHead(200);
        res.end(JSON.stringify(MESSAGES_LEAD_1));
      } else if (leadUid === 'lead-2') {
        res.writeHead(200);
        res.end(JSON.stringify(MESSAGES_LEAD_2));
      } else if (leadUid === 'lead-3') {
        res.writeHead(200);
        res.end(JSON.stringify({ messages: [], _metadata: { count: 0 }, _paging: {} }));
      } else if (leadUid === 'zero-lead') {
        res.writeHead(200);
        res.end(JSON.stringify({ messages: [], _metadata: { count: 0 }, _paging: {} }));
      } else if (leadUid === 'resp-lead-1') {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            messages: [
              {
                uid: 'resp-msg-1',
                leadUid: 'resp-lead-1',
                createdUtcDateTime: '2026-04-18T10:00:00Z',
                status: 'SENT',
                type: 'VRBO',
                senderType: 'AGENCY',
                content: { subject: null, text: 'Welcome! See you soon.' },
                threadUid: 'resp-thread-1',
                attachments: [],
              },
            ],
            _metadata: { count: 1 },
            _paging: {},
          }),
        );
      } else if (leadUid === 'limit-lead') {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            messages: [
              {
                uid: 'lim-msg-1',
                leadUid: 'limit-lead',
                createdUtcDateTime: '2026-04-20T09:00:00Z',
                status: 'CREATED',
                type: 'AIRBNB',
                senderType: 'GUEST',
                content: { subject: null, text: `Msg with limit=${limit}` },
                threadUid: 'lim-thread-1',
                attachments: [],
              },
            ],
            _metadata: { count: 1 },
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

describe('get-messages shell tool', () => {
  it('default (no filters) returns threads for BOOKING leads only, not BLOCK', async () => {
    const { stdout, code } = await runScript(['--property-id', 'VALID_PROPERTY'], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as { reservationId: string }[];
    const ids = data.map((t) => t.reservationId);
    expect(ids).toContain('lead-1');
    expect(ids).toContain('lead-2');
    expect(ids).not.toContain('lead-3');
  });

  it('--unresponded-only returns only threads where last message is from guest', async () => {
    const { stdout, code } = await runScript(
      ['--property-id', 'VALID_PROPERTY', '--unresponded-only'],
      { HOSTFULLY_API_KEY: 'testkey', HOSTFULLY_API_URL: `http://localhost:${port}` },
    );
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as { reservationId: string; unresponded: boolean }[];
    const ids = data.map((t) => t.reservationId);
    expect(ids).toContain('lead-1');
    expect(ids).not.toContain('lead-2');
    expect(data.every((t) => t.unresponded)).toBe(true);
  });

  it('--unresponded-only returns empty array when all threads are responded', async () => {
    const { stdout, code } = await runScript(
      ['--property-id', 'ALL_RESPONDED_PROPERTY', '--unresponded-only'],
      { HOSTFULLY_API_KEY: 'testkey', HOSTFULLY_API_URL: `http://localhost:${port}` },
    );
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as unknown[];
    expect(data).toEqual([]);
  });

  it('--limit 1 is passed as _limit query param to messages endpoint', async () => {
    const { stdout, code } = await runScript(
      ['--property-id', 'LIMIT_TEST_PROPERTY', '--limit', '1'],
      { HOSTFULLY_API_KEY: 'testkey', HOSTFULLY_API_URL: `http://localhost:${port}` },
    );
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as { messages: { text: string }[] }[];
    expect(data).toHaveLength(1);
    expect(data[0].messages[0].text).toContain('limit=1');
  });

  it('messages within a thread are sorted chronologically (oldest first)', async () => {
    const { stdout, code } = await runScript(['--property-id', 'VALID_PROPERTY'], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as {
      reservationId: string;
      messages: { timestamp: string }[];
    }[];
    const thread1 = data.find((t) => t.reservationId === 'lead-1');
    expect(thread1).toBeDefined();
    expect(thread1!.messages[0].timestamp).toBe('2026-04-20T10:00:00Z');
    expect(thread1!.messages[1].timestamp).toBe('2026-04-20T10:30:00Z');
    expect(thread1!.messages[2].timestamp).toBe('2026-04-20T11:00:00Z');
  });

  it('empty property returns empty array, exit 0', async () => {
    const { stdout, code } = await runScript(['--property-id', 'EMPTY_PROPERTY'], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as unknown[];
    expect(data).toEqual([]);
  });

  it('lead with zero messages is excluded from output', async () => {
    const { stdout, code } = await runScript(['--property-id', 'ZERO_MSG_PROPERTY'], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as { reservationId: string }[];
    const ids = data.map((t) => t.reservationId);
    expect(ids).not.toContain('zero-lead');
    expect(data).toHaveLength(0);
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

  it('API error (500 on leads fetch) exits 1 with non-empty stderr', async () => {
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
    expect(stdout).toContain('--unresponded-only');
    expect(stdout).toContain('--limit');
  });

  it('output shape has all required fields for lead-1', async () => {
    const { stdout, code } = await runScript(['--property-id', 'VALID_PROPERTY'], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as Record<string, unknown>[];
    const thread1 = data.find((t) => t['reservationId'] === 'lead-1');
    expect(thread1).toBeDefined();
    expect(thread1).toHaveProperty('reservationId', 'lead-1');
    expect(thread1).toHaveProperty('guestName', 'John Doe');
    expect(thread1).toHaveProperty('channel', 'AIRBNB');
    expect(thread1).toHaveProperty('unresponded', true);
    expect(Array.isArray(thread1!['messages'])).toBe(true);
    const messages = thread1!['messages'] as Record<string, unknown>[];
    expect(messages[0]).toHaveProperty('text', 'What time is check-in?');
    expect(messages[0]).toHaveProperty('sender', 'guest');
    expect(messages[0]).toHaveProperty('timestamp', '2026-04-20T10:00:00Z');
  });

  it('AGENCY senderType maps to host in output', async () => {
    const { stdout, code } = await runScript(['--property-id', 'VALID_PROPERTY'], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as { reservationId: string; messages: { sender: string }[] }[];
    const thread1 = data.find((t) => t.reservationId === 'lead-1');
    expect(thread1).toBeDefined();
    const hostMsg = thread1!.messages.find((m) => m.sender === 'host');
    expect(hostMsg).toBeDefined();
  });
});
