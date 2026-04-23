import { execFile } from 'child_process';
import * as http from 'http';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import path from 'path';

const SCRIPT_PATH = path.resolve(__dirname, '../../../src/worker-tools/platform/report-issue.ts');

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

const DB_RECORD = {
  id: '00000000-0000-0000-0000-000000000099',
  task_id: 'test-task',
  tool_name: 'test-tool',
  issue_description: 'test',
  patch_applied: false,
  created_at: '2026-01-01T00:00:00Z',
};

let server: http.Server;
let port: number;

let capturedRequests: Array<{ method: string; path: string; body: unknown }> = [];

let postgrestStatus = 201;
let slackPayload: Record<string, unknown> = {
  ok: true,
  ts: '1234567890.123456',
  channel: 'C_TEST_ISSUES',
};

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

      if (url === '/rest/v1/system_events') {
        if (postgrestStatus === 201) {
          res.writeHead(201);
          res.end(JSON.stringify([DB_RECORD]));
        } else {
          res.writeHead(postgrestStatus);
          res.end(JSON.stringify({ message: 'Internal server error' }));
        }
      } else if (url === '/chat.postMessage') {
        res.writeHead(200);
        res.end(JSON.stringify(slackPayload));
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
  postgrestStatus = 201;
  slackPayload = { ok: true, ts: '1234567890.123456', channel: 'C_TEST_ISSUES' };
});

function baseEnv(): Record<string, string> {
  return {
    SUPABASE_URL: `http://localhost:${port}`,
    SUPABASE_SECRET_KEY: 'test-secret',
    TENANT_ID: '00000000-0000-0000-0000-000000000003',
    SLACK_BOT_TOKEN: 'xoxb-test-token',
    ISSUES_SLACK_CHANNEL: 'C_TEST_ISSUES',
    SLACK_API_BASE_URL: `http://localhost:${port}`,
  };
}

const VALID_ARGS = [
  '--task-id',
  'task-123',
  '--tool-name',
  'get-messages',
  '--description',
  'Tool returned 500 unexpectedly',
];

describe('report-issue shell tool', () => {
  it('--help exits 0 with usage text containing all flags and env vars', async () => {
    const { stdout, code } = await runScript(['--help'], {});
    expect(code).toBe(0);
    expect(stdout).toContain('--task-id');
    expect(stdout).toContain('--tool-name');
    expect(stdout).toContain('--description');
    expect(stdout).toContain('--patch-diff');
    expect(stdout).toContain('SUPABASE_URL');
    expect(stdout).toContain('SUPABASE_SECRET_KEY');
    expect(stdout).toContain('TENANT_ID');
    expect(stdout).toContain('SLACK_BOT_TOKEN');
    expect(stdout).toContain('ISSUES_SLACK_CHANNEL');
  });

  it('missing --task-id exits 1 with --task-id in stderr', async () => {
    const { stderr, code } = await runScript(
      ['--tool-name', 'get-messages', '--description', 'something went wrong'],
      baseEnv(),
    );
    expect(code).toBe(1);
    expect(stderr).toContain('--task-id');
  });

  it('missing --tool-name exits 1 with --tool-name in stderr', async () => {
    const { stderr, code } = await runScript(
      ['--task-id', 'task-123', '--description', 'something went wrong'],
      baseEnv(),
    );
    expect(code).toBe(1);
    expect(stderr).toContain('--tool-name');
  });

  it('missing --description exits 1 with --description in stderr', async () => {
    const { stderr, code } = await runScript(
      ['--task-id', 'task-123', '--tool-name', 'get-messages'],
      baseEnv(),
    );
    expect(code).toBe(1);
    expect(stderr).toContain('--description');
  });

  it('missing SUPABASE_URL exits 1 with SUPABASE_URL in stderr', async () => {
    const { stderr, code } = await runScript(VALID_ARGS, {
      ...baseEnv(),
      SUPABASE_URL: '',
    });
    expect(code).toBe(1);
    expect(stderr).toContain('SUPABASE_URL');
  });

  it('missing SLACK_BOT_TOKEN exits 1 with SLACK_BOT_TOKEN in stderr', async () => {
    const { stderr, code } = await runScript(VALID_ARGS, {
      ...baseEnv(),
      SLACK_BOT_TOKEN: '',
    });
    expect(code).toBe(1);
    expect(stderr).toContain('SLACK_BOT_TOKEN');
  });

  it('happy path exits 0, stdout JSON contains ok:true and correct event_id', async () => {
    const { stdout, code } = await runScript(VALID_ARGS, baseEnv());
    expect(code).toBe(0);
    const result = JSON.parse(stdout) as { ok: boolean; event_id: string };
    expect(result.ok).toBe(true);
    expect(result.event_id).toBe('00000000-0000-0000-0000-000000000099');
  });

  it('--patch-diff sets patch_applied:true and patch_diff in PostgREST request body', async () => {
    const diff = 'diff --git a/tools/get-messages.ts b/tools/get-messages.ts\n--- a\n+++ b';
    const { stdout, code } = await runScript([...VALID_ARGS, '--patch-diff', diff], baseEnv());
    expect(code).toBe(0);
    const result = JSON.parse(stdout) as { ok: boolean; event_id: string };
    expect(result.ok).toBe(true);

    const dbReq = capturedRequests.find((r) => r.path === '/rest/v1/system_events');
    expect(dbReq).toBeDefined();
    const body = dbReq!.body as Record<string, unknown>;
    expect(body['patch_applied']).toBe(true);
    expect(typeof body['patch_diff']).toBe('string');
    expect(body['patch_diff']).toBe(diff);
  });

  it('PostgREST 500 exits 1 with Error: in stderr', async () => {
    postgrestStatus = 500;
    const { stderr, code } = await runScript(VALID_ARGS, baseEnv());
    expect(code).toBe(1);
    expect(stderr).toContain('Error:');
  });

  it('Slack ok:false exits 0 (DB write succeeded), stderr contains Warning:', async () => {
    slackPayload = { ok: false, error: 'channel_not_found' };
    const { stdout, stderr, code } = await runScript(VALID_ARGS, baseEnv());
    expect(code).toBe(0);
    expect(stderr).toContain('Warning:');
    const result = JSON.parse(stdout) as { ok: boolean };
    expect(result.ok).toBe(true);
  });

  it('ISSUES_SLACK_CHANNEL not set exits 0 with Warning: about skipping Slack', async () => {
    const { stdout, stderr, code } = await runScript(VALID_ARGS, {
      ...baseEnv(),
      ISSUES_SLACK_CHANNEL: '',
    });
    expect(code).toBe(0);
    expect(stderr).toContain('Warning:');
    const result = JSON.parse(stdout) as { ok: boolean };
    expect(result.ok).toBe(true);
  });
});
