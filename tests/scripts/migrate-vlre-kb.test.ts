import { execFile } from 'child_process';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

const SCRIPT_PATH = path.resolve(__dirname, '../../scripts/migrate-vlre-kb.ts');

function runScript(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      'npx',
      ['tsx', SCRIPT_PATH, ...args],
      { env: { ...process.env } },
      (err, stdout, stderr) => {
        resolve({ stdout, stderr, code: err ? ((err.code as number) ?? 1) : 0 });
      },
    );
  });
}

let server: http.Server;
let port: number;
let capturedRequests: Array<{ method: string; url: string; body: string }> = [];
let mockResponse: (method: string, url: string) => { status: number; body: string } = () => ({
  status: 200,
  body: '{"entries":[]}',
});

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      capturedRequests.push({ method: req.method ?? 'GET', url: req.url ?? '', body });
      const response = mockResponse(req.method ?? 'GET', req.url ?? '');
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(response.status);
      res.end(response.body);
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

let tempDirs: string[] = [];

beforeEach(() => {
  capturedRequests = [];
  mockResponse = () => ({ status: 200, body: '{"entries":[]}' });
});

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

function makeTempKbDir(props: Record<string, string>, common?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vlre-kb-test-'));
  tempDirs.push(dir);
  fs.mkdirSync(path.join(dir, 'properties'), { recursive: true });
  if (common !== undefined) {
    fs.writeFileSync(path.join(dir, 'common.md'), common);
  }
  for (const [code, content] of Object.entries(props)) {
    fs.writeFileSync(path.join(dir, 'properties', `${code}.md`), content);
  }
  return dir;
}

function makeTempMapping(
  dir: string,
  entries: Array<{ code: string; hostfullyUid: string }>,
): string {
  const file = path.join(dir, 'mapping.json');
  fs.writeFileSync(
    file,
    JSON.stringify({
      mappings: entries.map((e) => ({ ...e, address: 'Test Address', confidence: 'exact' })),
      unmatched: [],
    }),
  );
  return file;
}

function baseArgs(kbDir: string, mappingFile: string): string[] {
  return [
    '--api-url',
    `http://localhost:${port}`,
    '--admin-key',
    'test-key',
    '--mapping',
    mappingFile,
    '--kb-dir',
    kbDir,
  ];
}

const TIMEOUT = 30_000;

describe('migrate-vlre-kb', () => {
  it(
    'dry-run: no API calls made, [DRY-RUN] in stderr',
    async () => {
      const content = '# Test Property\nSome content\n';
      const kbDir = makeTempKbDir({ 'test-prop': content }, '# Common\nCommon content\n');
      const mappingFile = makeTempMapping(kbDir, [
        { code: 'test-prop', hostfullyUid: '00000000-0000-0000-0000-000000000001' },
      ]);

      const { stderr, code } = await runScript([...baseArgs(kbDir, mappingFile), '--dry-run']);

      expect(code).toBe(0);
      expect(stderr).toContain('[DRY-RUN]');
      expect(capturedRequests.length).toBe(0);
    },
    TIMEOUT,
  );

  it(
    'creates new entry when GET returns empty array',
    async () => {
      const content = '# New Property\nFresh content\n';
      const kbDir = makeTempKbDir({ 'new-prop': content });
      const mappingFile = makeTempMapping(kbDir, [
        { code: 'new-prop', hostfullyUid: '00000000-0000-0000-0000-000000000002' },
      ]);

      mockResponse = (method) => {
        if (method === 'GET') return { status: 200, body: '{"entries":[]}' };
        return { status: 201, body: '{"id":"created-id","content":"..."}' };
      };

      const { stderr, code } = await runScript(baseArgs(kbDir, mappingFile));

      expect(code).toBe(0);
      expect(stderr).toContain('[CREATE]');
      const posts = capturedRequests.filter((r) => r.method === 'POST');
      expect(posts.length).toBe(1);
    },
    TIMEOUT,
  );

  it(
    'updates entry when GET returns existing with different content',
    async () => {
      const content = '# Updated Property\nNew content\n';
      const entryId = 'existing-entry-id';
      const kbDir = makeTempKbDir({ 'existing-prop': content });
      const mappingFile = makeTempMapping(kbDir, [
        { code: 'existing-prop', hostfullyUid: '00000000-0000-0000-0000-000000000003' },
      ]);

      mockResponse = (method) => {
        if (method === 'GET') {
          return {
            status: 200,
            body: JSON.stringify({ entries: [{ id: entryId, content: 'old content' }] }),
          };
        }
        return { status: 200, body: '{"id":"' + entryId + '","content":"..."}' };
      };

      const { stderr, code } = await runScript(baseArgs(kbDir, mappingFile));

      expect(code).toBe(0);
      expect(stderr).toContain('[UPDATE]');
      const patches = capturedRequests.filter((r) => r.method === 'PATCH');
      expect(patches.length).toBe(1);
      expect(patches[0].url).toContain(entryId);
    },
    TIMEOUT,
  );

  it(
    'skips entry when GET returns existing with same content',
    async () => {
      const content = '# Same Property\nUnchanged content\n';
      const kbDir = makeTempKbDir({ 'same-prop': content });
      const mappingFile = makeTempMapping(kbDir, [
        { code: 'same-prop', hostfullyUid: '00000000-0000-0000-0000-000000000004' },
      ]);

      mockResponse = () => ({
        status: 200,
        body: JSON.stringify({ entries: [{ id: 'entry-abc', content }] }),
      });

      const { stderr, code } = await runScript(baseArgs(kbDir, mappingFile));

      expect(code).toBe(0);
      expect(stderr).toContain('[SKIP]');
      const mutations = capturedRequests.filter((r) => r.method === 'POST' || r.method === 'PATCH');
      expect(mutations.length).toBe(0);
    },
    TIMEOUT,
  );

  it(
    'skips content exceeding 100k chars with warning, exits 0',
    async () => {
      const largeContent = 'x'.repeat(100_001);
      const kbDir = makeTempKbDir({ 'large-prop': largeContent });
      const mappingFile = makeTempMapping(kbDir, [
        { code: 'large-prop', hostfullyUid: '00000000-0000-0000-0000-000000000005' },
      ]);

      const { stderr, code } = await runScript(baseArgs(kbDir, mappingFile));

      expect(code).toBe(0);
      expect(stderr).toContain('[WARN]');
      expect(stderr).toContain('100000 chars');
      expect(capturedRequests.length).toBe(0);
    },
    TIMEOUT,
  );

  it(
    'handles API 500 error: logs [ERROR], continues, exits 1',
    async () => {
      const content = '# Error Property\nSome content\n';
      const kbDir = makeTempKbDir({ 'error-prop': content });
      const mappingFile = makeTempMapping(kbDir, [
        { code: 'error-prop', hostfullyUid: '00000000-0000-0000-0000-000000000006' },
      ]);

      mockResponse = () => ({ status: 500, body: 'Internal Server Error' });

      const { stderr, code } = await runScript(baseArgs(kbDir, mappingFile));

      expect(code).toBe(1);
      expect(stderr).toContain('[ERROR]');
      expect(stderr).toContain('Errors: 1');
    },
    TIMEOUT,
  );

  it(
    'lowercases UIDs in API calls',
    async () => {
      const content = '# Uppercase UID Property\nContent\n';
      const kbDir = makeTempKbDir({ 'upper-prop': content });
      const uppercaseUid = 'ABCDEF12-3456-7890-ABCD-EF0000000007';
      const mappingFile = makeTempMapping(kbDir, [
        { code: 'upper-prop', hostfullyUid: uppercaseUid },
      ]);

      const { code } = await runScript(baseArgs(kbDir, mappingFile));

      expect(capturedRequests.length).toBeGreaterThan(0);
      const getReq = capturedRequests.find((r) => r.method === 'GET');
      expect(getReq).toBeDefined();
      expect(getReq!.url).toContain(uppercaseUid.toLowerCase());
      expect(getReq!.url).not.toContain(uppercaseUid);
      expect(code).toBe(0);
    },
    TIMEOUT,
  );

  it(
    'missing --admin-key exits 1 with error mentioning --admin-key',
    async () => {
      const kbDir = makeTempKbDir({ prop: '# content\n' });
      const mappingFile = makeTempMapping(kbDir, [
        { code: 'prop', hostfullyUid: '00000000-0000-0000-0000-000000000008' },
      ]);

      const { stderr, code } = await runScript([
        '--api-url',
        `http://localhost:${port}`,
        '--mapping',
        mappingFile,
        '--kb-dir',
        kbDir,
      ]);

      expect(code).toBe(1);
      expect(stderr).toContain('--admin-key');
      expect(capturedRequests.length).toBe(0);
    },
    TIMEOUT,
  );
});
