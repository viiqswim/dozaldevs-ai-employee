import { Router } from 'express';
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import { requireAdminKey } from '../middleware/admin-auth.js';
import { TenantSecretRepository } from '../services/tenant-secret-repository.js';
import { generateInstallationToken } from '../services/github-token-manager.js';
import { TenantIdParamSchema } from '../validation/schemas.js';

export interface AdminGithubRouteOptions {
  prisma?: PrismaClient;
}

interface GitHubRepo {
  full_name: string;
  html_url: string;
  default_branch: string;
  private: boolean;
}

interface GitHubInstallationReposResponse {
  total_count: number;
  repositories: Array<{
    full_name: string;
    html_url: string;
    default_branch: string;
    private: boolean;
    [key: string]: unknown;
  }>;
}

async function fetchAllRepos(token: string): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = [];
  let url: string | null = 'https://api.github.com/installation/repositories?per_page=100';

  while (url) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub API returned ${response.status}: ${body}`);
    }

    const data = (await response.json()) as GitHubInstallationReposResponse;
    for (const repo of data.repositories) {
      repos.push({
        full_name: repo.full_name,
        html_url: repo.html_url,
        default_branch: repo.default_branch,
        private: repo.private,
      });
    }

    const linkHeader = response.headers.get('Link');
    url = parseNextLink(linkHeader);
  }

  return repos;
}

function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  // Link header format: <url>; rel="next", <url>; rel="last"
  const parts = linkHeader.split(',');
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) {
      return match[1];
    }
  }
  return null;
}

export function adminGithubRoutes(opts: AdminGithubRouteOptions = {}): Router {
  const router = Router();
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  const prisma = opts.prisma ?? new PrismaClient();
  const secretRepo = new TenantSecretRepository(prisma);

  router.get('/admin/tenants/:tenantId/github/repos', requireAdminKey, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_ID' });
      return;
    }

    const { tenantId } = paramResult.data;

    let installationId: string | null;
    try {
      installationId = await secretRepo.get(tenantId, 'github_installation_id');
    } catch (err) {
      logger.error({ err, tenantId }, 'Failed to read github_installation_id from tenant secrets');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
      return;
    }

    if (!installationId) {
      res.status(404).json({ error: 'GitHub not connected' });
      return;
    }

    let token: string;
    try {
      const installationToken = await generateInstallationToken(parseInt(installationId, 10));
      token = installationToken.token;
    } catch (err) {
      logger.error({ err, tenantId }, 'Failed to generate GitHub installation token');
      res.status(502).json({ error: 'Failed to authenticate with GitHub' });
      return;
    }

    let repos: GitHubRepo[];
    try {
      repos = await fetchAllRepos(token);
    } catch (err) {
      logger.error({ err, tenantId }, 'Failed to fetch repositories from GitHub');
      res.status(502).json({ error: 'Failed to fetch repositories from GitHub' });
      return;
    }

    res.status(200).json({ repos });
  });

  return router;
}
