import { execFile } from 'child_process';
import * as http from 'http';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import path from 'path';

const SCRIPT_PATH = path.resolve(__dirname, '../../../src/worker-tools/hostfully/send-message.ts');

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

let capturedRequests: Array<{ method: string; path: string; body: unknown }> = [];
let serverStatus = 201;

let server: http.Server;
let port: number;

function baseEnv(): Record<string, string> {
  return {
    HOSTFULLY_API_KEY: 'testkey',
    HOSTFULLY_API_URL: `http://localhost:${port}`,
  };
}

const VALID_ARGS = ['--lead-id', 'lead-123', '--message', 'Hello from the test suite'];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = req.url ?? '';
    let rawBody = '';

    req.on('data', (chunk: Buffer) => {
      rawBody += chunk.toString();
    });

    req.on('end', () => {
      const parsed: unknown = rawBody.length > 0 ? JSON.parse(rawBody) : null;
      capturedRequests.push({ method: req.method ?? 'GET', path: url, body: parsed });

      res.setHeader('Content-Type', 'application/json');

      if (url === '/messages' && req.method === 'POST') {
        if (serverStatus === 201) {
          res.writeHead(201);
          res.end(
            JSON.stringify({
              uid: 'test-uid-001',
              leadUid: 'lead-123',
              threadUid: 'thread-123',
              senderType: 'AGENCY',
              createdUtcDateTime: '2026-04-23T00:00:00Z',
            }),
          );
        } else {
          res.writeHead(serverStatus);
          res.end(JSON.stringify({ error: 'server error' }));
        }
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as { port: number }).port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

beforeEach(() => {
  capturedRequests = [];
  serverStatus = 201;
});

describe('send-message shell tool', () => {
  it('happy path exits 0 with sent:true, messageId, and timestamp in stdout', async () => {
    const { stdout, code } = await runScript(VALID_ARGS, baseEnv());
    expect(code).toBe(0);
    const result = JSON.parse(stdout) as {
      sent: boolean;
      messageId: string | null;
      timestamp: string | null;
    };
    expect(result.sent).toBe(true);
    expect(result.messageId).toBe('test-uid-001');
    expect(result.timestamp).toBe('2026-04-23T00:00:00Z');
  });

  it('sends POST body with type:DIRECT_MESSAGE, leadUid, and content.text', async () => {
    await runScript(VALID_ARGS, baseEnv());
    const req = capturedRequests.find((r) => r.path === '/messages' && r.method === 'POST');
    expect(req).toBeDefined();
    const body = req!.body as Record<string, unknown>;
    expect(body['type']).toBe('DIRECT_MESSAGE');
    expect(body['leadUid']).toBe('lead-123');
    const content = body['content'] as Record<string, unknown>;
    expect(content['text']).toBe('Hello from the test suite');
  });

  it('includes threadUid in request body when --thread-id is provided', async () => {
    await runScript([...VALID_ARGS, '--thread-id', 'thread-abc'], baseEnv());
    const req = capturedRequests.find((r) => r.path === '/messages' && r.method === 'POST');
    expect(req).toBeDefined();
    const body = req!.body as Record<string, unknown>;
    expect(body['threadUid']).toBe('thread-abc');
  });

  it('omits threadUid from request body when --thread-id is not provided', async () => {
    await runScript(VALID_ARGS, baseEnv());
    const req = capturedRequests.find((r) => r.path === '/messages' && r.method === 'POST');
    expect(req).toBeDefined();
    const body = req!.body as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(body, 'threadUid')).toBe(false);
  });

  it('exits 1 when --lead-id is missing', async () => {
    const { stderr, code } = await runScript(['--message', 'hello'], baseEnv());
    expect(code).toBe(1);
    expect(stderr).toContain('--lead-id');
  });

  it('exits 1 when --message is missing', async () => {
    const { stderr, code } = await runScript(['--lead-id', 'lead-123'], baseEnv());
    expect(code).toBe(1);
    expect(stderr).toContain('--message');
  });

  it('exits 1 when HOSTFULLY_API_KEY is missing', async () => {
    const { stderr, code } = await runScript(VALID_ARGS, {
      HOSTFULLY_API_KEY: '',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(1);
    expect(stderr).toContain('HOSTFULLY_API_KEY');
  });

  it('exits 1 when API returns 500', async () => {
    serverStatus = 500;
    const { stderr, code } = await runScript(VALID_ARGS, baseEnv());
    expect(code).toBe(1);
    expect(stderr.length).toBeGreaterThan(0);
  });

  it('exits 1 when API returns 400 and stderr contains status code', async () => {
    serverStatus = 400;
    const { stderr, code } = await runScript(VALID_ARGS, baseEnv());
    expect(code).toBe(1);
    expect(stderr).toContain('400');
  });

  it('exits 1 when API returns 401 and stderr contains status code', async () => {
    serverStatus = 401;
    const { stderr, code } = await runScript(VALID_ARGS, baseEnv());
    expect(code).toBe(1);
    expect(stderr).toContain('401');
  });

  it('--help exits 0 with usage text containing all flags and env vars', async () => {
    const { stdout, code } = await runScript(['--help'], {});
    expect(code).toBe(0);
    expect(stdout).toContain('--lead-id');
    expect(stdout).toContain('--thread-id');
    expect(stdout).toContain('--message');
    expect(stdout).toContain('HOSTFULLY_API_KEY');
  });
});
