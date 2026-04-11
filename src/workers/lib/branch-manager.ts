import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 60_000;
const GIT_USER_EMAIL = 'ai-employee@platform.local';
const GIT_USER_NAME = 'AI Employee';
const BRANCH_PREFIX = 'ai/';
const MAX_KEBAB_CHARS = 60;

export interface BranchResult {
  success: boolean;
  existed: boolean;
  error?: string;
}

export interface PushResult {
  pushed: boolean;
  reason?: string;
  error?: string;
}

export function buildBranchName(ticketId: string, title: string): string {
  const kebabTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const kebab = `${ticketId}-${kebabTitle}`;
  const truncated = kebab.slice(0, MAX_KEBAB_CHARS).replace(/-+$/g, '');

  return `${BRANCH_PREFIX}${truncated}`;
}

export async function ensureBranch(branchName: string, cwd = '/workspace'): Promise<BranchResult> {
  try {
    await execFileAsync('git', ['config', 'user.email', GIT_USER_EMAIL], {
      cwd,
      timeout: GIT_TIMEOUT_MS,
    });
    await execFileAsync('git', ['config', 'user.name', GIT_USER_NAME], {
      cwd,
      timeout: GIT_TIMEOUT_MS,
    });

    const { stdout } = await execFileAsync('git', ['ls-remote', '--heads', 'origin', branchName], {
      cwd,
      timeout: GIT_TIMEOUT_MS,
    });

    const existed = stdout.trim().length > 0;

    if (existed) {
      await execFileAsync('git', ['checkout', '-b', branchName, `origin/${branchName}`], {
        cwd,
        timeout: GIT_TIMEOUT_MS,
      });
    } else {
      await execFileAsync('git', ['checkout', '-b', branchName], {
        cwd,
        timeout: GIT_TIMEOUT_MS,
      });
    }

    return { success: true, existed };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, existed: false, error: message };
  }
}

export async function commitAndPush(
  branchName: string,
  message: string,
  cwd = '/workspace',
): Promise<PushResult> {
  try {
    await execFileAsync('git', ['add', '-A'], { cwd, timeout: GIT_TIMEOUT_MS });

    const hasStagedChanges = await execFileAsync('git', ['diff', '--cached', '--quiet'], {
      cwd,
      timeout: GIT_TIMEOUT_MS,
    })
      .then(() => false)
      .catch(() => true);

    if (!hasStagedChanges) {
      return { pushed: false, reason: 'no_changes' };
    }

    await execFileAsync('git', ['commit', '-m', message], { cwd, timeout: GIT_TIMEOUT_MS });

    try {
      await execFileAsync('git', ['fetch', 'origin'], {
        cwd,
        timeout: GIT_TIMEOUT_MS,
      });
    } catch (_) {}

    await execFileAsync('git', ['push', '--force-with-lease', 'origin', branchName], {
      cwd,
      timeout: GIT_TIMEOUT_MS,
    });

    return { pushed: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { pushed: false, error: msg };
  }
}
