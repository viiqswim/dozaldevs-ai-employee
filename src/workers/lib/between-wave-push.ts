import { execFile } from 'child_process';
import { promisify } from 'util';
import { Logger } from '../../lib/logger.js';

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 60_000;

export interface BetweenWavePushOptions {
  repoRoot: string;
  branchName: string;
  waveNumber: number;
  waveDescription: string;
  logger: Logger;
}

export interface BetweenWavePushResult {
  pushed: boolean;
  commitSha: string | null;
}

/**
 * Commits and pushes changes between waves.
 *
 * Flow:
 * 1. Check for uncommitted changes via `git status --porcelain`
 * 2. If no changes, log and return { pushed: false, commitSha: null }
 * 3. Stage all changes: `git add -A`
 * 4. Commit with message: `feat(wave-{N}): {description}`
 * 5. Get commit SHA: `git rev-parse HEAD`
 * 6. Push with --force: `git push --force origin {branchName}`
 * 7. Return { pushed: true, commitSha }
 *
 * On any git error, logs and throws (caller decides fallback).
 */
export async function pushBetweenWaves(
  opts: BetweenWavePushOptions,
): Promise<BetweenWavePushResult> {
  const { repoRoot, branchName, waveNumber, waveDescription, logger } = opts;

  try {
    // 1. Check for uncommitted changes
    const { stdout: statusOutput } = await execFileAsync(
      'git',
      ['-C', repoRoot, 'status', '--porcelain'],
      {
        timeout: GIT_TIMEOUT_MS,
      },
    );

    if (!statusOutput.trim()) {
      logger.info({ wave: waveNumber }, 'no changes to commit this wave');
      return { pushed: false, commitSha: null };
    }

    // 2. Stage all changes
    await execFileAsync('git', ['-C', repoRoot, 'add', '-A'], {
      timeout: GIT_TIMEOUT_MS,
    });

    // 3. Commit with conventional message
    const commitMessage = `feat(wave-${waveNumber}): ${waveDescription}`;
    await execFileAsync('git', ['-C', repoRoot, 'commit', '-m', commitMessage], {
      timeout: GIT_TIMEOUT_MS,
    });

    // 4. Get commit SHA
    const { stdout: shaOutput } = await execFileAsync(
      'git',
      ['-C', repoRoot, 'rev-parse', 'HEAD'],
      {
        timeout: GIT_TIMEOUT_MS,
      },
    );
    const commitSha = shaOutput.trim();

    await execFileAsync('git', ['-C', repoRoot, 'push', '--force', 'origin', branchName], {
      timeout: GIT_TIMEOUT_MS,
    });

    logger.info({ wave: waveNumber, commitSha }, `pushed wave ${waveNumber}`);
    return { pushed: true, commitSha };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ wave: waveNumber, error: message }, `failed to push wave ${waveNumber}`);
    throw error;
  }
}
