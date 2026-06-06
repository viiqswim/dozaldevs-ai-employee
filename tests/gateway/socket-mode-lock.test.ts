import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExecFileSync } = vi.hoisted(() => ({
  mockExecFileSync: vi.fn(),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execFileSync: mockExecFileSync,
  };
});

import {
  LOCK_FILE_PATH,
  acquireSocketModeLock,
  releaseSocketModeLock,
} from '../../src/gateway/lib/socket-mode-lock.js';

function writeLockPid(pid: number): void {
  fs.writeFileSync(LOCK_FILE_PATH, String(pid), 'utf8');
}

function deleteLock(): void {
  try {
    fs.unlinkSync(LOCK_FILE_PATH);
  } catch {
    /* empty */
  }
}

beforeEach(() => {
  deleteLock();
  vi.clearAllMocks();
  mockExecFileSync.mockReturnValue('');
});

afterEach(() => {
  deleteLock();
});

describe('acquireSocketModeLock', () => {
  it('acquire-free: claims lock when no lock file exists', async () => {
    const result = await acquireSocketModeLock();

    expect(result).toEqual({ acquired: true });
    const written = fs.readFileSync(LOCK_FILE_PATH, 'utf8').trim();
    expect(written).toBe(String(process.pid));
  });

  it('reclaim-stale: reclaims lock held by a dead process', async () => {
    writeLockPid(999_999_999);

    const result = await acquireSocketModeLock();

    expect(result).toEqual({ acquired: true });
    const written = fs.readFileSync(LOCK_FILE_PATH, 'utf8').trim();
    expect(written).toBe(String(process.pid));
  });

  it('blocked-live: returns { acquired: false } when a live gateway process holds the lock', async () => {
    const livePid = process.ppid;
    writeLockPid(livePid);

    mockExecFileSync.mockReturnValue(`node tsx/dist/loader.mjs gateway/server.ts`);

    const result = await acquireSocketModeLock();

    expect(result).toEqual({ acquired: false, holderPid: livePid });
    const written = fs.readFileSync(LOCK_FILE_PATH, 'utf8').trim();
    expect(written).toBe(String(livePid));
  }, 10_000);

  it('re-entrant: returns { acquired: true } when we already hold the lock', async () => {
    writeLockPid(process.pid);

    const result = await acquireSocketModeLock();

    expect(result).toEqual({ acquired: true });
  });
});

describe('releaseSocketModeLock', () => {
  it('release-guard: does NOT delete the lock when a different PID holds it', () => {
    const successorPid = process.pid + 1;
    writeLockPid(successorPid);

    releaseSocketModeLock();

    expect(fs.existsSync(LOCK_FILE_PATH)).toBe(true);
    const written = fs.readFileSync(LOCK_FILE_PATH, 'utf8').trim();
    expect(written).toBe(String(successorPid));
  });

  it('release-own: deletes the lock when we hold it', () => {
    writeLockPid(process.pid);

    releaseSocketModeLock();

    expect(fs.existsSync(LOCK_FILE_PATH)).toBe(false);
  });
});
