import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fsPromises from 'node:fs/promises';
import type { Logger } from '../../lib/logger.js';

const DEFAULT_MIN_BYTES = 2_147_483_648; // 2 GB

export interface DiskCheckResult {
  ok: boolean;
  freeBytes: number;
  reason: string;
}

/**
 * Checks available disk space at the given path.
 *
 * Strategy:
 * 1. Try fs.promises.statfs (Node ≥19) — if available, use bfree * bsize
 * 2. Fall back to `df -k` and parse output (4th column = available KB)
 * 3. Never throws — catches all errors and returns { ok: false, freeBytes: 0, reason: "..." }
 *
 * @param path - Directory path to check
 * @param minBytes - Minimum required free space (default: 2 GB)
 * @returns DiskCheckResult with ok, freeBytes, and reason
 */
export async function checkDiskSpace(
  path: string,
  minBytes: number = DEFAULT_MIN_BYTES,
): Promise<DiskCheckResult> {
  try {
    // Try statfs first (Node ≥19)
    let freeBytes: number | null = null;

    try {
      const statfs = (fsPromises as any).statfs;

      if (typeof statfs === 'function') {
        const result = await statfs(path);
        freeBytes = result.bfree * result.bsize;
      }
    } catch {
      // statfs not available, will fall back to df
    }

    // Fall back to df if statfs didn't work
    if (freeBytes === null) {
      freeBytes = await getDiskSpaceViaDf(path);
    }

    // Check if sufficient
    if (freeBytes >= minBytes) {
      return {
        ok: true,
        freeBytes,
        reason: 'sufficient disk space',
      };
    }

    return {
      ok: false,
      freeBytes,
      reason: `insufficient disk space: ${freeBytes} < ${minBytes}`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      freeBytes: 0,
      reason: `disk check failed: ${msg}`,
    };
  }
}

/**
 * Convenience wrapper around checkDiskSpace that logs a warning if space is insufficient.
 *
 * @param path - Directory path to check
 * @param minBytes - Minimum required free space
 * @param logger - Logger instance
 * @returns true if space is sufficient, false otherwise
 */
export async function checkDiskSpaceOrWarn(
  path: string,
  minBytes: number,
  logger: Logger,
): Promise<boolean> {
  const result = await checkDiskSpace(path, minBytes);

  if (!result.ok) {
    logger.warn(`Insufficient disk space: ${result.reason}`);
  }

  return result.ok;
}

/**
 * Internal helper: parse df output to get available space in bytes.
 * df -k output format: Filesystem 1K-blocks Used Available Use% Mounted on
 * We want the 4th column (Available) from the second line, multiply by 1024.
 */
async function getDiskSpaceViaDf(path: string): Promise<number> {
  const execFileAsync = promisify(execFile);
  const { stdout } = await execFileAsync('df', ['-k', path]);

  const lines = stdout.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('df output has fewer than 2 lines');
  }

  const parts = lines[1].split(/\s+/);
  if (parts.length < 4) {
    throw new Error('df output line has fewer than 4 columns');
  }

  const availableKb = parseInt(parts[3], 10);
  if (isNaN(availableKb)) {
    throw new Error(`df available column is not a number: ${parts[3]}`);
  }

  return availableKb * 1024;
}
