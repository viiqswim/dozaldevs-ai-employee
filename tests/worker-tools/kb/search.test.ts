import { execFile } from 'child_process';
import * as http from 'http';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import path from 'path';

const SCRIPT_PATH = path.resolve(__dirname, '../../../src/worker-tools/kb/search.ts');

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

let server: http.Server;
let port: number;

let capturedRequests: Array<{ url: string; method: string }> = [];
let mockResponse: { status: number; body: string } = { status: 200, body: '[]' };

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = req.url ?? '';
    capturedRequests.push({ url, method: req.method ?? 'GET' });

    res.setHeader('Content-Type', 'application/json');
    res.writeHead(mockResponse.status);
    res.end(mockResponse.body);
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
  mockResponse = { status: 200, body: '[]' };
});

function baseEnv(): Record<string, string> {
  return {
    SUPABASE_URL: `http://localhost:${port}`,
    SUPABASE_SECRET_KEY: 'test-secret',
    TENANT_ID: '00000000-0000-0000-0000-000000000003',
  };
}

describe('kb/search shell tool', () => {
  it('--help exits 0 with usage containing --entity-type, --entity-id, SUPABASE_URL but NOT --query', async () => {
    const { stdout, code } = await runScript(['--help'], {});
    expect(code).toBe(0);
    expect(stdout).toContain('--entity-type');
    expect(stdout).toContain('--entity-id');
    expect(stdout).toContain('SUPABASE_URL');
    expect(stdout).not.toContain('--query');
  });

  it('missing SUPABASE_URL exits 1 with SUPABASE_URL in stderr', async () => {
    const { stderr, code } = await runScript(['--entity-type', 'property', '--entity-id', 'test'], {
      ...baseEnv(),
      SUPABASE_URL: '',
    });
    expect(code).toBe(1);
    expect(stderr).toContain('SUPABASE_URL');
  });

  it('missing SUPABASE_SECRET_KEY exits 1 with SUPABASE_SECRET_KEY in stderr', async () => {
    const { stderr, code } = await runScript(['--entity-type', 'property', '--entity-id', 'test'], {
      ...baseEnv(),
      SUPABASE_SECRET_KEY: '',
    });
    expect(code).toBe(1);
    expect(stderr).toContain('SUPABASE_SECRET_KEY');
  });

  it('missing TENANT_ID and no --tenant-id exits 1 with tenant in stderr', async () => {
    const { stderr, code } = await runScript(['--entity-type', 'property', '--entity-id', 'test'], {
      ...baseEnv(),
      TENANT_ID: '',
    });
    expect(code).toBe(1);
    expect(stderr).toContain('tenant');
  });

  it('missing --entity-type exits 1 with --entity-type in stderr', async () => {
    const { stderr, code } = await runScript(['--entity-id', 'test'], baseEnv());
    expect(code).toBe(1);
    expect(stderr).toContain('--entity-type');
  });

  it('missing --entity-id exits 1 with --entity-id in stderr', async () => {
    const { stderr, code } = await runScript(['--entity-type', 'property'], baseEnv());
    expect(code).toBe(1);
    expect(stderr).toContain('--entity-id');
  });

  it('returns entity and common content with entity first and separator between', async () => {
    mockResponse = {
      status: 200,
      body: JSON.stringify([
        { scope: 'entity', content: '## WiFi\nNetwork: TestNet\nPassword: abc123' },
        { scope: 'common', content: '## General Policies\nCheck-in: 3pm' },
      ]),
    };
    const { stdout, code } = await runScript(
      ['--entity-type', 'property', '--entity-id', 'test-prop-123'],
      baseEnv(),
    );
    expect(code).toBe(0);
    const output = JSON.parse(stdout) as {
      content: string;
      entityFound: boolean;
      commonFound: boolean;
      entityType: string;
      entityId: string;
    };
    expect(output.entityFound).toBe(true);
    expect(output.commonFound).toBe(true);
    expect(output.content).toContain('WiFi');
    expect(output.content).toContain('General Policies');
    expect(output.entityType).toBe('property');
    expect(output.entityId).toBe('test-prop-123');
    const wifiIdx = output.content.indexOf('WiFi');
    const generalIdx = output.content.indexOf('General Policies');
    expect(wifiIdx).toBeLessThan(generalIdx);
  });

  it('only common row returned — entityFound false, content contains only common', async () => {
    mockResponse = {
      status: 200,
      body: JSON.stringify([{ scope: 'common', content: '## General Policies\nCheck-in: 3pm' }]),
    };
    const { stdout, code } = await runScript(
      ['--entity-type', 'property', '--entity-id', 'nonexistent'],
      baseEnv(),
    );
    expect(code).toBe(0);
    const output = JSON.parse(stdout) as {
      content: string;
      entityFound: boolean;
      commonFound: boolean;
    };
    expect(output.entityFound).toBe(false);
    expect(output.commonFound).toBe(true);
    expect(output.content).toContain('General Policies');
    expect(output.content).not.toContain('WiFi');
  });

  it('only entity row returned — commonFound false, no separator in content', async () => {
    mockResponse = {
      status: 200,
      body: JSON.stringify([
        { scope: 'entity', content: '## WiFi\nNetwork: OnlyEntity\nPassword: xyz' },
      ]),
    };
    const { stdout, code } = await runScript(
      ['--entity-type', 'property', '--entity-id', 'entity-only'],
      baseEnv(),
    );
    expect(code).toBe(0);
    const output = JSON.parse(stdout) as {
      content: string;
      entityFound: boolean;
      commonFound: boolean;
    };
    expect(output.entityFound).toBe(true);
    expect(output.commonFound).toBe(false);
    expect(output.content).toContain('WiFi');
    expect(output.content).not.toContain('---');
  });

  it('empty array — content is empty string, both flags false', async () => {
    mockResponse = { status: 200, body: '[]' };
    const { stdout, code } = await runScript(
      ['--entity-type', 'property', '--entity-id', 'ghost'],
      baseEnv(),
    );
    expect(code).toBe(0);
    const output = JSON.parse(stdout) as {
      content: string;
      entityFound: boolean;
      commonFound: boolean;
    };
    expect(output.content).toBe('');
    expect(output.entityFound).toBe(false);
    expect(output.commonFound).toBe(false);
  });

  it('PostgREST 500 on all requests — exits 1 with Error: in stderr', async () => {
    mockResponse = { status: 500, body: 'Internal Server Error' };
    const { stderr, code } = await runScript(
      ['--entity-type', 'property', '--entity-id', 'test'],
      baseEnv(),
    );
    expect(code).toBe(1);
    expect(stderr).toContain('Error:');
  });

  it('--tenant-id flag value appears as tenant_id=eq.{value} in request URL', async () => {
    mockResponse = { status: 200, body: '[]' };
    const { code } = await runScript(
      ['--entity-type', 'property', '--entity-id', 'check-tenant', '--tenant-id', 'my-tenant-uuid'],
      baseEnv(),
    );
    expect(code).toBe(0);
    expect(capturedRequests.length).toBeGreaterThan(0);
    expect(capturedRequests[0].url).toContain('tenant_id=eq.my-tenant-uuid');
  });
});
