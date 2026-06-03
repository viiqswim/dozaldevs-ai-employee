import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile, spawnSync } from 'child_process';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const SCRIPT_PATH = path.resolve(__dirname, '../get-token.ts');

function runScript(
  args: string[],
  envOverrides: Record<string, string> = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env['TASK_ID'];
    delete env['GATEWAY_URL'];
    Object.assign(env, envOverrides);

    execFile('npx', ['tsx', SCRIPT_PATH, ...args], { env }, (err, stdout, stderr) => {
      resolve({ stdout, stderr, code: err ? ((err.code as number) ?? 1) : 0 });
    });
  });
}

function runSync(args: string[], envOverrides: Record<string, string | undefined> = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env['TASK_ID'];
  delete env['GATEWAY_URL'];
  for (const [k, v] of Object.entries(envOverrides)) {
    if (v === undefined) {
      delete env[k];
    } else {
      env[k] = v;
    }
  }
  return spawnSync('npx', ['tsx', SCRIPT_PATH, ...args], { env, encoding: 'utf8', timeout: 10000 });
}

let mockServer: http.Server;
let mockServerPort: number;
let mockResponseStatus = 200;
let mockResponseBody = JSON.stringify({
  token: 'ghs_testtoken123',
  expires_at: '2026-06-02T12:00:00Z',
});

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    mockServer = http.createServer((req, res) => {
      res.writeHead(mockResponseStatus, { 'Content-Type': 'application/json' });
      res.end(mockResponseBody);
    });
    mockServer.listen(0, '127.0.0.1', () => {
      const addr = mockServer.address() as { port: number };
      mockServerPort = addr.port;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    mockServer.close(() => resolve());
  });
  try {
    fs.unlinkSync('/tmp/github-token');
  } catch {
    // ignore if file doesn't exist
  }
});

describe('get-token.ts', () => {
  it('--help exits 0 with usage text', () => {
    const result = runSync(['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('TASK_ID');
    expect(result.stdout).toContain('GATEWAY_URL');
    expect(result.stdout).toContain('/tmp/github-token');
  });

  it('exits 1 with error when TASK_ID is missing', () => {
    const result = runSync([], {});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('TASK_ID');
  });

  it('returns token JSON and writes /tmp/github-token on success', async () => {
    mockResponseStatus = 200;
    mockResponseBody = JSON.stringify({
      token: 'ghs_testtoken123',
      expires_at: '2026-06-02T12:00:00Z',
    });

    const result = await runScript([], {
      TASK_ID: 'test-task-id-123',
      GATEWAY_URL: `http://127.0.0.1:${mockServerPort}`,
    });

    expect(result.code).toBe(0);
    const output = JSON.parse(result.stdout.trim()) as { token: string; expires_at: string };
    expect(output.token).toBe('ghs_testtoken123');
    expect(output.expires_at).toBe('2026-06-02T12:00:00Z');

    const tokenFile = fs.readFileSync('/tmp/github-token', 'utf8');
    expect(tokenFile).toBe('ghs_testtoken123');
  });

  it('exits 1 with GitHub not connected error on 404', async () => {
    mockResponseStatus = 404;
    mockResponseBody = JSON.stringify({ error: 'GitHub not connected' });

    const result = await runScript([], {
      TASK_ID: 'test-task-id-123',
      GATEWAY_URL: `http://127.0.0.1:${mockServerPort}`,
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('GitHub not connected');
  });

  it('exits 1 with task not executing error on 403', async () => {
    mockResponseStatus = 403;
    mockResponseBody = JSON.stringify({ error: 'Task is not in Executing state' });

    const result = await runScript([], {
      TASK_ID: 'test-task-id-123',
      GATEWAY_URL: `http://127.0.0.1:${mockServerPort}`,
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('not in Executing state');
  });

  it('exits 1 with bad request error on 400', async () => {
    mockResponseStatus = 400;
    mockResponseBody = JSON.stringify({ error: 'X-Task-ID header missing' });

    const result = await runScript([], {
      TASK_ID: 'test-task-id-123',
      GATEWAY_URL: `http://127.0.0.1:${mockServerPort}`,
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Bad request');
  });

  it('exits 1 with gateway error on 500', async () => {
    mockResponseStatus = 500;
    mockResponseBody = JSON.stringify({ error: 'Internal server error' });

    const result = await runScript([], {
      TASK_ID: 'test-task-id-123',
      GATEWAY_URL: `http://127.0.0.1:${mockServerPort}`,
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('500');
  });

  it('exits 1 when gateway is unreachable', async () => {
    const result = await runScript([], {
      TASK_ID: 'test-task-id-123',
      GATEWAY_URL: 'http://127.0.0.1:19999',
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Failed to connect');
  });
});
