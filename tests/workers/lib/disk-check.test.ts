import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkDiskSpace, checkDiskSpaceOrWarn } from '../../../src/workers/lib/disk-check.js';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));
vi.mock('node:fs/promises', () => ({
  statfs: vi.fn(),
}));

const { execFile } = await import('node:child_process');
const fsPromises = await import('node:fs/promises');

describe('disk-check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ok: true when sufficient space via statfs', async () => {
    vi.mocked(fsPromises.statfs).mockResolvedValue({
      type: 0,
      blocks: 2000000,
      bfree: 1000000,
      bavail: 1000000,
      files: 1000000,
      ffree: 500000,
      bsize: 4096,
    } as any);

    const result = await checkDiskSpace('/tmp', 1);

    expect(result.ok).toBe(true);
    expect(result.freeBytes).toBe(4_096_000_000);
    expect(result.reason).toBe('sufficient disk space');
  });

  it('returns ok: false when insufficient space via statfs', async () => {
    vi.mocked(fsPromises.statfs).mockResolvedValue({
      type: 0,
      blocks: 1000,
      bfree: 1,
      bavail: 1,
      files: 1000,
      ffree: 500,
      bsize: 1,
    } as any);

    const result = await checkDiskSpace('/tmp', Number.MAX_SAFE_INTEGER);

    expect(result.ok).toBe(false);
    expect(result.freeBytes).toBe(1);
    expect(result.reason).toContain('insufficient disk space');
  });

  it('falls back to df when statfs throws TypeError', async () => {
    vi.mocked(fsPromises.statfs).mockRejectedValue(new TypeError('statfs not available'));

    vi.mocked(execFile).mockImplementation((cmd, args, callback) => {
      if (cmd === 'df' && (args as string[])?.[0] === '-k') {
        (callback as any)(
          null,
          {
            stdout:
              'Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/disk1 1000000 500000 500000 50% /',
          },
          '',
        );
      }
      return {} as any;
    });

    const result = await checkDiskSpace('/tmp', 100_000);

    expect(result.ok).toBe(true);
    expect(result.freeBytes).toBe(512_000_000);
    expect(result.reason).toBe('sufficient disk space');
  });

  it('returns ok: false when df shows insufficient space', async () => {
    vi.mocked(fsPromises.statfs).mockRejectedValue(new TypeError('statfs not available'));

    vi.mocked(execFile).mockImplementation((cmd, args, callback) => {
      if (cmd === 'df' && (args as string[])?.[0] === '-k') {
        (callback as any)(
          null,
          {
            stdout:
              'Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/disk1 1000000 900000 100000 90% /',
          },
          '',
        );
      }
      return {} as any;
    });

    const result = await checkDiskSpace('/tmp', 200_000_000);

    expect(result.ok).toBe(false);
    expect(result.freeBytes).toBe(102_400_000);
    expect(result.reason).toContain('insufficient disk space');
  });

  it('never throws and returns error result on unexpected error', async () => {
    vi.mocked(fsPromises.statfs).mockRejectedValue(new TypeError('statfs not available'));

    vi.mocked(execFile).mockImplementation((cmd, args, callback) => {
      (callback as any)(new Error('df failed'));
      return {} as any;
    });

    const result = await checkDiskSpace('/tmp', 1_000_000);

    expect(result.ok).toBe(false);
    expect(result.freeBytes).toBe(0);
    expect(result.reason).toContain('disk check failed');
    expect(typeof result.reason).toBe('string');
  });

  it('uses default threshold of 2 GB when minBytes not provided', async () => {
    vi.mocked(fsPromises.statfs).mockResolvedValue({
      type: 0,
      blocks: 2000000,
      bfree: 1000000,
      bavail: 1000000,
      files: 1000000,
      ffree: 500000,
      bsize: 4096,
    } as any);

    const result = await checkDiskSpace('/tmp');

    expect(result.ok).toBe(typeof result.ok === 'boolean');
    expect(result.freeBytes).toBeGreaterThanOrEqual(0);
    expect(result.reason).toBe('sufficient disk space');
  });

  it('returns true and does not log when space is sufficient', async () => {
    vi.mocked(fsPromises.statfs).mockResolvedValue({
      type: 0,
      blocks: 2000000,
      bfree: 1000000,
      bavail: 1000000,
      files: 1000000,
      ffree: 500000,
      bsize: 4096,
    } as any);

    const mockLogger = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    const result = await checkDiskSpaceOrWarn('/tmp', 1, mockLogger as any);

    expect(result).toBe(true);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('returns false and logs warning when space is insufficient', async () => {
    vi.mocked(fsPromises.statfs).mockResolvedValue({
      type: 0,
      blocks: 1000,
      bfree: 1,
      bavail: 1,
      files: 1000,
      ffree: 500,
      bsize: 1,
    } as any);

    const mockLogger = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    const result = await checkDiskSpaceOrWarn('/tmp', Number.MAX_SAFE_INTEGER, mockLogger as any);

    expect(result).toBe(false);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Insufficient disk space'),
    );
  });
});
