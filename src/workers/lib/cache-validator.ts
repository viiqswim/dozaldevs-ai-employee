import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access } from 'node:fs/promises';

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 30_000;

export interface CacheValidationResult {
  valid: boolean;
  reason: string;
}

/**
 * Validates a git cache directory using 3-point validation:
 * 1. .git structure check (HEAD, config, refs/ exist)
 * 2. Remote URL check (matches expectedRemoteUrl)
 * 3. HEAD sanity check (git rev-parse HEAD exits 0)
 *
 * Never throws — always returns result object.
 */
export async function validateCache(
  cachePath: string,
  expectedRemoteUrl: string,
): Promise<CacheValidationResult> {
  try {
    // Point 1: .git structure check
    const gitStructureValid = await checkGitStructure(cachePath);
    if (!gitStructureValid) {
      return {
        valid: false,
        reason: '.git directory structure is invalid or missing (HEAD, config, or refs/ not found)',
      };
    }

    // Point 2: Remote URL check
    const remoteUrlValid = await checkRemoteUrl(cachePath, expectedRemoteUrl);
    if (!remoteUrlValid) {
      return {
        valid: false,
        reason: `remote URL does not match expected URL (expected: ${expectedRemoteUrl})`,
      };
    }

    // Point 3: HEAD sanity check
    const headValid = await checkHeadSanity(cachePath);
    if (!headValid) {
      return {
        valid: false,
        reason: 'HEAD is not resolvable (git rev-parse HEAD failed)',
      };
    }

    return {
      valid: true,
      reason: 'cache is valid',
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      reason: `validation error: ${msg}`,
    };
  }
}

async function checkGitStructure(cachePath: string): Promise<boolean> {
  try {
    // Check .git directory exists
    await access(`${cachePath}/.git`);

    // Check HEAD file exists
    await access(`${cachePath}/.git/HEAD`);

    // Check config file exists
    await access(`${cachePath}/.git/config`);

    // Check refs directory exists
    await access(`${cachePath}/.git/refs`);

    return true;
  } catch {
    return false;
  }
}

async function checkRemoteUrl(cachePath: string, expectedRemoteUrl: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', cachePath, 'remote', 'get-url', 'origin'],
      {
        timeout: GIT_TIMEOUT_MS,
      },
    );

    const actualUrl = stdout.trim();
    return actualUrl === expectedRemoteUrl;
  } catch {
    return false;
  }
}

async function checkHeadSanity(cachePath: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['-C', cachePath, 'rev-parse', 'HEAD'], {
      timeout: GIT_TIMEOUT_MS,
    });

    return true;
  } catch {
    return false;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoPath = process.argv[2];
  const remoteUrl = process.argv[3];
  if (!repoPath || !remoteUrl) {
    process.stdout.write(
      JSON.stringify({ valid: false, reason: 'Usage: cache-validator.js <repoPath> <remoteUrl>' }) +
        '\n',
    );
    process.exit(1);
  }
  validateCache(repoPath, remoteUrl)
    .then((result) => {
      process.stdout.write(JSON.stringify(result) + '\n');
      process.exit(result.valid ? 0 : 1);
    })
    .catch((err: unknown) => {
      process.stdout.write(JSON.stringify({ valid: false, reason: String(err) }) + '\n');
      process.exit(1);
    });
}
