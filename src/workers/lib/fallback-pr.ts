import { execFile } from 'child_process';
import { promisify } from 'util';
import type { Logger } from '../../lib/logger.js';

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 60_000;
const ERROR_TRUNCATE_LIMIT = 2000;

export interface FallbackPrTicket {
  key: string;
  summary: string;
  description: string;
}

export interface FallbackPrOpts {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  githubClient: any;
  repoOwner: string;
  repoName: string;
  branchName: string;
  ticket: FallbackPrTicket;
  completedWaves: number[];
  failedWave: number | null;
  error: Error | string | null;
  logger: Logger;
  repoRoot?: string;
}

export interface FallbackPrResult {
  created: boolean;
  prUrl: string | null;
  reason: string;
}

async function runGit(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('git', args, { cwd, timeout: GIT_TIMEOUT_MS });
}

async function tryRunGit(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await runGit(args, cwd);
    return stdout.trim();
  } catch {
    return '';
  }
}

function buildPrBody(opts: {
  ticket: FallbackPrTicket;
  completedWaves: number[];
  failedWave: number | null;
  error: Error | string | null;
  diffStats: string;
  commitLog: string;
}): string {
  const { ticket, completedWaves, failedWave, error, diffStats, commitLog } = opts;

  const errorText =
    error instanceof Error ? (error.stack ?? error.message) : String(error ?? 'Unknown error');
  const truncatedError = errorText.slice(0, ERROR_TRUNCATE_LIMIT);

  const wavesSection =
    completedWaves.length > 0 ? completedWaves.map((w) => `- [x] Wave ${w}`).join('\n') : 'None';

  const waveFailedLine =
    failedWave !== null
      ? `Wave ${failedWave} — ${error instanceof Error ? error.message : String(error ?? 'Unknown error')}`
      : 'N/A';

  return [
    '## ⚠️ Agent Failure — Draft PR',
    '',
    '### Ticket',
    `- **Key**: ${ticket.key}`,
    `- **Summary**: ${ticket.summary}`,
    `- **Description**: ${ticket.description}`,
    '',
    '### Waves Completed',
    wavesSection,
    '',
    '### Wave That Failed',
    waveFailedLine,
    '',
    '### Error Details',
    '```',
    truncatedError,
    '```',
    '',
    '### Diff Stats',
    '```',
    diffStats || '(unavailable)',
    '```',
    '',
    '### Commit Log',
    '```',
    commitLog || '(unavailable)',
    '```',
    '',
    '### Next Steps',
    "Manual review required. Check failing wave's tasks. Do NOT merge without human review.",
  ].join('\n');
}

export async function createFallbackPr(opts: FallbackPrOpts): Promise<FallbackPrResult> {
  const {
    githubClient,
    repoOwner,
    repoName,
    branchName,
    ticket,
    completedWaves,
    failedWave,
    error,
    logger,
    repoRoot = '/workspace',
  } = opts;

  let diffNames: string;
  try {
    const { stdout } = await runGit(['diff', '--name-only', 'origin/main'], repoRoot);
    diffNames = stdout.trim();
  } catch {
    try {
      const { stdout } = await runGit(['diff', '--name-only', 'origin/HEAD'], repoRoot);
      diffNames = stdout.trim();
    } catch {
      diffNames = '(unknown)';
    }
  }

  if (!diffNames) {
    logger.info({ branchName }, 'No changes to preserve — skipping fallback PR');
    return { created: false, prUrl: null, reason: 'no changes to preserve' };
  }

  try {
    const lsRemoteOut = await tryRunGit(['ls-remote', '--heads', 'origin', branchName], repoRoot);

    if (!lsRemoteOut) {
      logger.info({ branchName }, 'Branch not on remote — pushing with --force-with-lease');
      await runGit(['push', '--force-with-lease', 'origin', branchName], repoRoot);
    }
  } catch (pushErr) {
    logger.warn({ branchName, err: pushErr }, 'Failed to push branch to remote');
  }

  const diffStats = await tryRunGit(['diff', '--stat', 'origin/main'], repoRoot);
  const commitLog = await tryRunGit(['log', '--oneline', 'origin/main..HEAD'], repoRoot);

  const prBody = buildPrBody({ ticket, completedWaves, failedWave, error, diffStats, commitLog });
  const title = `[DRAFT] ${ticket.key}: ${ticket.summary}`;

  const pr = await githubClient.createPR({
    owner: repoOwner,
    repo: repoName,
    title,
    head: branchName,
    base: 'main',
    body: prBody,
  });

  logger.info({ branchName, prUrl: pr.html_url }, 'Fallback draft PR created');
  return { created: true, prUrl: pr.html_url as string, reason: 'draft PR created' };
}
