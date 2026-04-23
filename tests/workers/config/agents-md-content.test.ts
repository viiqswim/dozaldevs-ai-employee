import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const AGENTS_MD_PATH = path.resolve(__dirname, '../../../src/workers/config/agents.md');

describe('src/workers/config/agents.md — self-repair policy', () => {
  let content: string;

  // Read the file once — if it doesn't exist, all tests will fail with a clear error
  try {
    content = fs.readFileSync(AGENTS_MD_PATH, 'utf-8');
  } catch {
    content = ''; // Tests will fail below with descriptive messages
  }

  it('file exists and is non-empty', () => {
    expect(content.length).toBeGreaterThan(0);
  });

  it('is a substantial policy document (>20 lines)', () => {
    const lineCount = content.split('\n').length;
    expect(lineCount).toBeGreaterThan(20);
  });

  it('policy 1: grants permission to read /tools/ source files', () => {
    expect(content).toContain('/tools/');
    expect(content.toLowerCase()).toContain('read');
  });

  it('policy 2: grants permission to patch tools via tsx', () => {
    expect(content.toLowerCase()).toContain('patch');
    expect(content).toContain('tsx');
  });

  it('policy 3: requires --help smoke test after any patch', () => {
    expect(content).toContain('--help');
  });

  it('policy 4: mandates reporting via tsx /tools/platform/report-issue.ts', () => {
    expect(content).toContain('tsx /tools/platform/report-issue.ts');
  });

  it('policy 5: declares /app/dist/ off-limits (platform code boundary)', () => {
    expect(content).toContain('/app/dist/');
  });

  it('policy 6: prohibits direct database access (psql and PostgREST)', () => {
    expect(content).toContain('psql');
    expect(content).toContain('PostgREST');
  });

  it('does not contain runtime-specific channel IDs (slack pattern C0...)', () => {
    // Slack channel IDs start with C0 followed by alphanumeric — not expected in static policy
    expect(content).not.toMatch(/\bC0[A-Z0-9]{8,}\b/);
  });

  it('does not contain runtime-specific UUIDs', () => {
    expect(content).not.toMatch(/00000000-0000-0000-0000/);
  });

  it('does not contain localhost URLs (policy is environment-agnostic)', () => {
    expect(content).not.toContain('localhost');
  });
});
