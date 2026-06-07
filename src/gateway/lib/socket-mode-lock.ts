/**
 * Socket Mode single-instance lock.
 *
 * The gateway runs under `tsx watch` which spawns a SUPERVISOR process + a CHILD `node` process
 * (the real gateway). On every file save, tsx kills and reforks the child. Without a lock, the
 * dying child and the new child can both attempt to connect to Slack's Socket Mode at the same
 * time — Slack delivers each event to exactly one connected socket (round-robin), so a zombie
 * leaf steals ~50% of `app_mention` events silently.
 *
 * This lock serialises Socket Mode startup so only one gateway process holds an active connection:
 *   - If no lock file exists → write our PID → proceed to boltApp.start()
 *   - If a lock file exists but the holder is dead or unrelated → reclaim (overwrite with our PID)
 *   - If the holder is live AND identity-verified → enter a short retry window (handles the
 *     tsx watch kill+refork race where the old child is dying while the new child tries to acquire)
 *   - After the retry window exhausts → return { acquired: false, holderPid } → caller exits(1)
 *
 * Design notes:
 *   - Lock file lives in os.tmpdir() — ephemeral, so a crashed-container restart is never blocked
 *   - Identity check uses `ps -p <pid> -o args=` to confirm the holder is also a gateway process
 *     for THIS repo (prevents reclaiming a live, unrelated process with the same PID reuse)
 *   - `process.kill(pid, 0)` on macOS returns true even for zombies; ps identity check catches that
 *   - No external npm packages — only Node.js built-ins
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const LOCK_FILE_PATH = path.join(os.tmpdir(), 'ai-employee-gateway-socketmode.lock');

const IDENTITY_MARKER = path.join('gateway', 'server.ts');
const ACQUIRE_TIMEOUT_MS = 2000;
const POLL_INTERVAL_MS = 100;

type AcquireResult = { acquired: true } | { acquired: false; holderPid: number };

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false; // no such process
    return true; // EPERM → process exists but we can't signal it
  }
}

function isGatewayProcess(pid: number): boolean {
  try {
    const args = execFileSync('ps', ['-p', String(pid), '-o', 'args='], {
      encoding: 'utf8',
      timeout: 3000,
    });
    return args.includes(IDENTITY_MARKER);
  } catch {
    return false;
  }
}

function readLockPid(): number | null {
  try {
    const content = fs.readFileSync(LOCK_FILE_PATH, 'utf8').trim();
    const pid = parseInt(content, 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function writeLock(): void {
  fs.writeFileSync(LOCK_FILE_PATH, String(process.pid), 'utf8');
}

/**
 * Attempts to acquire the Socket Mode lock for this process.
 *
 * Returns `{ acquired: true }` when the lock was obtained — immediately, after reclaiming a
 * stale/dead holder, or after the holder released within the retry window.
 *
 * Returns `{ acquired: false, holderPid }` if a live, identity-verified holder did not release
 * within the retry window (~2 s).
 */
export async function acquireSocketModeLock(): Promise<AcquireResult> {
  const deadline = Date.now() + ACQUIRE_TIMEOUT_MS;

  while (true) {
    const storedPid = readLockPid();

    // Case 1: No lock file — claim it immediately.
    if (storedPid === null) {
      writeLock();
      return { acquired: true };
    }

    // Case 2: We already hold the lock (re-entrant or duplicate acquire call).
    if (storedPid === process.pid) {
      return { acquired: true };
    }

    // Case 3: Holder process is dead — reclaim.
    if (!isProcessAlive(storedPid)) {
      writeLock();
      return { acquired: true };
    }

    // Case 4: Alive, but not a gateway process for this repo (PID reused) — reclaim.
    if (!isGatewayProcess(storedPid)) {
      writeLock();
      return { acquired: true };
    }

    // Case 5: Live, verified gateway holder — check retry window (tsx watch kill+refork race).
    if (Date.now() >= deadline) {
      return { acquired: false, holderPid: storedPid };
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * Releases the Socket Mode lock for this process.
 *
 * Only deletes the lock file if it still contains OUR PID — avoids deleting a successor's lock
 * in the tsx watch refork scenario where the new child claimed the lock before this shutdown fires.
 */
export function releaseSocketModeLock(): void {
  const storedPid = readLockPid();
  if (storedPid === process.pid) {
    try {
      fs.unlinkSync(LOCK_FILE_PATH);
    } catch {
      // Already deleted — ignore.
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
