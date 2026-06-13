import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockWarn, mockReadFile } = vi.hoisted(() => ({
  mockWarn: vi.fn(),
  mockReadFile: vi.fn(),
}));

vi.mock('../../src/lib/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: mockWarn,
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('fs/promises', () => ({
  readFile: mockReadFile,
}));

import { checkOutputFiles } from '../../src/workers/lib/output-contract.mjs';
import { APPROVAL_MESSAGE_PATH } from '../../src/lib/output-contract-constants.js';

function setupReadFileMock(summaryJson: string): void {
  mockReadFile.mockImplementation(async (path: string) => {
    if (path === APPROVAL_MESSAGE_PATH) {
      throw Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
    }
    return summaryJson;
  });
}

describe('output-contract version compat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('legacy file (no version field) is treated as v1 — no error thrown', async () => {
    const legacyJson = JSON.stringify({
      summary: 'Guest replied, all good.',
      classification: 'NO_ACTION_NEEDED',
    });
    setupReadFileMock(legacyJson);

    const result = await checkOutputFiles('task-legacy');

    expect(result.content).toBe(legacyJson);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('current version (v1) is accepted normally — no warn, content returned', async () => {
    const v1Json = JSON.stringify({
      version: 1,
      summary: 'Draft ready for PM review.',
      classification: 'NEEDS_APPROVAL',
    });
    setupReadFileMock(v1Json);

    const result = await checkOutputFiles('task-v1');

    expect(result.content).toBe(v1Json);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('future version (v99) triggers a warn but does NOT throw — content still returned', async () => {
    const futureJson = JSON.stringify({
      version: 99,
      summary: 'Written by a future harness.',
      classification: 'NO_ACTION_NEEDED',
    });
    setupReadFileMock(futureJson);

    await expect(checkOutputFiles('task-future')).resolves.not.toThrow();

    const result = await checkOutputFiles('task-future');
    expect(result.content).toBe(futureJson);

    expect(mockWarn).toHaveBeenCalled();
    const warnCall = mockWarn.mock.calls[0] as [Record<string, unknown>, string];
    expect(warnCall[0]).toMatchObject({ version: 99, known: 1 });
    expect(warnCall[1]).toMatch(/degrading gracefully/i);
  });
});
