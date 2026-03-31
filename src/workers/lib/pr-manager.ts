import { GitHubClient, GitHubPR } from '../../lib/github-client.js';
import { TaskRow } from './task-context.js';

const PR_BODY_DESC_LIMIT = 500;

export interface CreateOrUpdatePRParams {
  owner: string;
  repo: string;
  headBranch: string;
  base: string;
  ticketId: string;
  summary: string;
  task: TaskRow;
  executionId: string | null;
}

export interface PRResult {
  pr: GitHubPR;
  wasExisting: boolean;
}

export async function checkExistingPR(
  owner: string,
  repo: string,
  headBranch: string,
  githubClient: GitHubClient,
): Promise<GitHubPR | null> {
  const prs = await githubClient.listPRs({
    owner,
    repo,
    state: 'open',
    head: `${owner}:${headBranch}`,
  });

  if (prs.length === 0) {
    return null;
  }

  return prs[0];
}

export function buildPRBody(task: TaskRow, executionId: string | null): string {
  const triageResult = task.triage_result as Record<string, unknown> | null;
  const issue = triageResult?.issue as Record<string, unknown> | undefined;
  const fields = issue?.fields as Record<string, unknown> | undefined;

  const summary = (fields?.summary as string | undefined) ?? 'No summary provided';
  const rawDescription = fields?.description ?? null;

  let description = '';
  if (typeof rawDescription === 'string') {
    description = rawDescription.slice(0, PR_BODY_DESC_LIMIT);
  } else if (rawDescription !== null && typeof rawDescription === 'object') {
    description = JSON.stringify(rawDescription).slice(0, PR_BODY_DESC_LIMIT);
  }

  const lines: string[] = [`## Ticket: ${task.external_id}`, '', `**Summary:** ${summary}`, ''];

  if (description) {
    lines.push('## Description', '', description, '');
  }

  if (executionId) {
    lines.push(`**Execution ID:** ${executionId}`, '');
  }

  lines.push('---', '*This PR was created automatically by the AI Employee platform.*');

  return lines.join('\n');
}

export async function createOrUpdatePR(
  params: CreateOrUpdatePRParams,
  githubClient: GitHubClient,
): Promise<PRResult> {
  const { owner, repo, headBranch, base, ticketId, summary, task, executionId } = params;

  const existing = await checkExistingPR(owner, repo, headBranch, githubClient);

  if (existing) {
    return { pr: existing, wasExisting: true };
  }

  const title = `[AI] ${ticketId}: ${summary}`;
  const body = buildPRBody(task, executionId);

  const pr = await githubClient.createPR({
    owner,
    repo,
    title,
    head: headBranch,
    base,
    body,
  });

  return { pr, wasExisting: false };
}
