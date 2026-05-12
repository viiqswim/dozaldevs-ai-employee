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

const LEAD_WITH_MESSAGES = {
  uid: 'lead-abc',
  propertyUid: 'prop-1',
  type: 'BOOKING',
  status: 'BOOKED',
  channel: 'AIRBNB',
  checkInLocalDateTime: '2026-04-25T15:00:00',
  checkOutLocalDateTime: '2026-04-28T11:00:00',
  guestInformation: { firstName: 'Maria', lastName: 'Garcia' },
};

const LEAD_NO_MESSAGES = {
  uid: 'lead-empty',
  propertyUid: 'prop-2',
  type: 'BOOKING',
  status: 'BOOKED',
  channel: 'VRBO',
  checkInLocalDateTime: '2026-04-20T15:00:00',
  checkOutLocalDateTime: '2026-04-23T11:00:00',
  guestInformation: { firstName: 'Ghost', lastName: 'Guest' },
};

const LEAD_RESPONDED = {
  uid: 'lead-responded',
  propertyUid: 'prop-3',
  type: 'BOOKING',
  status: 'BOOKED',
  channel: 'BOOKING_COM',
  checkInLocalDateTime: '2026-04-21T15:00:00',
  checkOutLocalDateTime: '2026-04-24T11:00:00',
  guestInformation: { firstName: 'Bob', lastName: 'Replied' },
};

const MESSAGES_LEAD_ABC = {
  messages: [
    {
      uid: 'msg-abc-c',
      leadUid: 'lead-abc',
      createdUtcDateTime: '2026-04-22T12:00:00Z',
      status: 'CREATED',
      type: 'AIRBNB',
      senderType: 'GUEST',
      content: { subject: null, text: 'Is there parking?' },
      threadUid: 'thread-abc',
      attachments: [],
    },
    {
      uid: 'msg-abc-b',
      leadUid: 'lead-abc',
      createdUtcDateTime: '2026-04-22T11:30:00Z',
      status: 'SENT',
      type: 'AIRBNB',
      senderType: 'AGENCY',
      content: { subject: null, text: 'Check-in at 3pm.' },
      threadUid: 'thread-abc',
      attachments: [],
    },
    {
      uid: 'msg-abc-a',
      leadUid: 'lead-abc',
      createdUtcDateTime: '2026-04-22T11:00:00Z',
      status: 'CREATED',
      type: 'AIRBNB',
      senderType: 'GUEST',
      content: { subject: null, text: 'What time is check-in?' },
      threadUid: 'thread-abc',
      attachments: [],
    },
  ],
  _metadata: { count: 3 },
  _paging: {},
};

const MESSAGES_LEAD_RESPONDED = {
  messages: [
    {
      uid: 'msg-resp-1',
      leadUid: 'lead-responded',
      createdUtcDateTime: '2026-04-21T10:00:00Z',
      status: 'SENT',
      type: 'BOOKING_COM',
      senderType: 'AGENCY',
      content: { subject: null, text: 'Welcome!' },
      threadUid: 'thread-responded',
      attachments: [],
    },
  ],
  _metadata: { count: 1 },
  _paging: {},
};

let server: http.Server;
let port: number;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const rawUrl = req.url ?? '';
    res.setHeader('Content-Type', 'application/json');
    const parsedUrl = new URL(rawUrl, 'http://localhost');

    if (rawUrl.startsWith('/leads/')) {
      const leadId = rawUrl.replace('/leads/', '').split('?')[0];

      if (leadId === 'lead-abc') {
        res.writeHead(200);
        res.end(JSON.stringify(LEAD_WITH_MESSAGES));
      } else if (leadId === 'lead-empty') {
        res.writeHead(200);
        res.end(JSON.stringify(LEAD_NO_MESSAGES));
      } else if (leadId === 'lead-responded') {
        res.writeHead(200);
        res.end(JSON.stringify(LEAD_RESPONDED));
      } else if (leadId === 'lead-error') {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Internal server error' }));
      } else if (leadId === 'lead-limit-test') {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            uid: 'lead-limit-test',
            propertyUid: 'prop-limit',
            channel: 'AIRBNB',
            status: 'BOOKED',
            checkInLocalDateTime: '2026-04-20T15:00:00',
            checkOutLocalDateTime: '2026-04-22T11:00:00',
            guestInformation: { firstName: 'Limit', lastName: 'Test' },
          }),
        );
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } else if (rawUrl.startsWith('/messages?')) {
      const leadUid = parsedUrl.searchParams.get('leadUid') ?? '';
      const limit = parsedUrl.searchParams.get('_limit') ?? '30';

      if (leadUid === 'lead-abc') {
        res.writeHead(200);
        res.end(JSON.stringify(MESSAGES_LEAD_ABC));
      } else if (leadUid === 'lead-empty') {
        res.writeHead(200);
        res.end(JSON.stringify({ messages: [], _metadata: { count: 0 }, _paging: {} }));
      } else if (leadUid === 'lead-responded') {
        res.writeHead(200);
        res.end(JSON.stringify(MESSAGES_LEAD_RESPONDED));
      } else if (leadUid === 'lead-limit-test') {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            messages: [
              {
                uid: 'lim-msg',
                leadUid: 'lead-limit-test',
                createdUtcDateTime: '2026-04-20T09:00:00Z',
                status: 'CREATED',
                type: 'AIRBNB',
                senderType: 'GUEST',
                content: { subject: null, text: `Msg with limit=${limit}` },
                threadUid: 'lim-thread',
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

describe('get-messages --lead-id flag', () => {
  it('returns ThreadSummary[] with one element for a lead with messages', async () => {
    const { stdout, code } = await runScript(['--lead-id', 'lead-abc'], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as Record<string, unknown>[];
    expect(data).toHaveLength(1);
    expect(data[0]).toHaveProperty('leadUid', 'lead-abc');
  });

  it('output shape has all required ThreadSummary fields', async () => {
    const { stdout, code } = await runScript(['--lead-id', 'lead-abc'], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as Record<string, unknown>[];
    const thread = data[0];
    expect(thread).toHaveProperty('leadUid', 'lead-abc');
    expect(thread).toHaveProperty('propertyUid', 'prop-1');
    expect(thread).toHaveProperty('guestName', 'Maria Garcia');
    expect(thread).toHaveProperty('channel', 'AIRBNB');
    expect(thread).toHaveProperty('checkIn', '2026-04-25T15:00:00');
    expect(thread).toHaveProperty('checkOut', '2026-04-28T11:00:00');
    expect(thread).toHaveProperty('leadStatus', 'BOOKED');
    expect(thread).toHaveProperty('unresponded', true);
    expect(Array.isArray(thread['messages'])).toBe(true);
  });

  it('messages are sorted chronologically (oldest first)', async () => {
    const { stdout, code } = await runScript(['--lead-id', 'lead-abc'], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as {
      messages: { timestamp: string; sender: string; text: string }[];
    }[];
    const msgs = data[0].messages;
    expect(msgs).toHaveLength(3);
    expect(msgs[0].timestamp).toBe('2026-04-22T11:00:00Z');
    expect(msgs[0].sender).toBe('guest');
    expect(msgs[1].timestamp).toBe('2026-04-22T11:30:00Z');
    expect(msgs[1].sender).toBe('host');
    expect(msgs[2].timestamp).toBe('2026-04-22T12:00:00Z');
    expect(msgs[2].sender).toBe('guest');
  });

  it('returns empty array when lead has no messages', async () => {
    const { stdout, code } = await runScript(['--lead-id', 'lead-empty'], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as unknown[];
    expect(data).toEqual([]);
  });

  it('--unresponded-only with --lead-id returns thread when last message is from guest', async () => {
    const { stdout, code } = await runScript(['--lead-id', 'lead-abc', '--unresponded-only'], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as { leadUid: string }[];
    expect(data).toHaveLength(1);
    expect(data[0].leadUid).toBe('lead-abc');
  });

  it('--unresponded-only with --lead-id is ignored — returns full thread regardless of last sender', async () => {
    const { stdout, code } = await runScript(
      ['--lead-id', 'lead-responded', '--unresponded-only'],
      { HOSTFULLY_API_KEY: 'testkey', HOSTFULLY_API_URL: `http://localhost:${port}` },
    );
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as { leadUid: string; unresponded: boolean }[];
    expect(data).toHaveLength(1);
    expect(data[0].leadUid).toBe('lead-responded');
    expect(data[0].unresponded).toBe(false);
  });

  it('--limit is passed as _limit query param to messages endpoint', async () => {
    const { stdout, code } = await runScript(['--lead-id', 'lead-limit-test', '--limit', '5'], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as { messages: { text: string }[] }[];
    expect(data).toHaveLength(1);
    expect(data[0].messages[0].text).toContain('limit=5');
  });

  it('exits 1 with mutual-exclusivity error when both --lead-id and --property-id are given', async () => {
    const { stderr, code } = await runScript(['--lead-id', 'lead-abc', '--property-id', 'prop-1'], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(1);
    expect(stderr).toContain('mutually exclusive');
  });

  it('exits 1 when neither --lead-id nor --property-id nor HOSTFULLY_AGENCY_UID is provided', async () => {
    const { stderr, code } = await runScript([], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(1);
    expect(stderr).toContain('--lead-id');
    expect(stderr).toContain('--property-id');
  });

  it('exits 1 with error on API failure when fetching single lead', async () => {
    const { stderr, code } = await runScript(['--lead-id', 'lead-error'], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(1);
    expect(stderr).toContain('lead-error');
  });

  it('--help output documents --lead-id flag', async () => {
    const { stdout, code } = await runScript(['--help'], {});
    expect(code).toBe(0);
    expect(stdout).toContain('--lead-id');
    expect(stdout).toContain('--property-id');
    expect(stdout.toLowerCase()).toContain('mutually exclusive');
  });
});
