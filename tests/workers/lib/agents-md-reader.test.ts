import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { readAgentsMd } from '../../../src/workers/lib/agents-md-reader.js';

describe('readAgentsMd', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-md-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when AGENTS.md does not exist', async () => {
    const result = await readAgentsMd(tmpDir);
    expect(result).toBeNull();
  });

  it('returns full content when within maxChars', async () => {
    const content = '# My Agents\n\nSome instructions here.';
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), content);
    const result = await readAgentsMd(tmpDir);
    expect(result).toBe(content);
  });

  it('truncates content when over maxChars', async () => {
    const longContent = 'x'.repeat(200);
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), longContent);
    const result = await readAgentsMd(tmpDir, 100);
    expect(result).not.toBeNull();
    expect(result!.startsWith('x'.repeat(100))).toBe(true);
    expect(result!).toContain('[TRUNCATED at 100 chars]');
    expect(result!.length).toBeGreaterThan(100); // includes the notice
  });

  it('returns null on read error (non-existent path)', async () => {
    const result = await readAgentsMd('/nonexistent/path/that/does/not/exist');
    expect(result).toBeNull();
  });

  it('uses custom maxChars parameter', async () => {
    const content = 'a'.repeat(50);
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), content);
    const result = await readAgentsMd(tmpDir, 30);
    expect(result!).toContain('[TRUNCATED at 30 chars]');
  });
});
