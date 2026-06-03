import crypto from 'crypto';
import { Router } from 'express';
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import { requireAdminKey } from '../middleware/admin-auth.js';
import { TenantSecretRepository } from '../services/tenant-secret-repository.js';
import { TenantIntegrationRepository } from '../services/tenant-integration-repository.js';
import { generateInstallationToken } from '../services/github-token-manager.js';
import { TenantIdParamSchema } from '../validation/schemas.js';

export interface AdminGithubRouteOptions {
  prisma?: PrismaClient;
}

interface GitHubInstallationAccount {
  login: string;
  type: string;
  avatar_url: string;
}

interface GitHubInstallation {
  id: number;
  account: GitHubInstallationAccount;
  [key: string]: unknown;
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function generateAppJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iat: now - 60,
      exp: now + 10 * 60,
      iss: appId,
    }),
  );

  const signingInput = `${header}.${payload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput, 'utf8');
  const signature = base64url(sign.sign(privateKey));

  return `${signingInput}.${signature}`;
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
  const integrationRepo = new TenantIntegrationRepository(prisma);

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

  router.get(
    '/admin/tenants/:tenantId/github/available-installations',
    requireAdminKey,
    async (req, res) => {
      const paramResult = TenantIdParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        res.status(400).json({ error: 'INVALID_ID' });
        return;
      }

      const { tenantId } = paramResult.data;

      const appId = process.env.GITHUB_APP_ID;
      const rawPrivateKey = process.env.GITHUB_PRIVATE_KEY;
      if (!appId || !rawPrivateKey) {
        res.status(503).json({ error: 'GitHub App not configured' });
        return;
      }
      const privateKey = rawPrivateKey.replace(/\\n/g, '\n');

      let jwt: string;
      try {
        jwt = generateAppJwt(appId, privateKey);
      } catch (err) {
        logger.error({ err, tenantId }, 'Failed to generate GitHub App JWT');
        res.status(503).json({ error: 'Failed to generate GitHub App JWT' });
        return;
      }

      const installations: GitHubInstallation[] = [];
      let url: string | null = 'https://api.github.com/app/installations?per_page=100';

      try {
        while (url) {
          const response = await fetch(url, {
            headers: {
              Authorization: `Bearer ${jwt}`,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
            },
          });

          if (!response.ok) {
            const body = await response.text();
            throw new Error(`GitHub API returned ${response.status}: ${body}`);
          }

          const data = (await response.json()) as GitHubInstallation[];
          installations.push(...data);

          const linkHeader = response.headers.get('Link');
          url = parseNextLink(linkHeader);
        }
      } catch (err) {
        logger.error({ err, tenantId }, 'Failed to fetch GitHub App installations');
        res.status(502).json({ error: 'Failed to fetch GitHub App installations' });
        return;
      }

      let currentIntegration: { external_id: string } | null = null;
      try {
        currentIntegration = await integrationRepo.findByTenantAndProvider(tenantId, 'github');
      } catch (err) {
        logger.error({ err, tenantId }, 'Failed to read tenant GitHub integration');
        res.status(500).json({ error: 'INTERNAL_ERROR' });
        return;
      }

      const result = installations.map((inst) => ({
        id: inst.id,
        account: {
          login: inst.account.login,
          type: inst.account.type,
          avatar_url: inst.account.avatar_url,
        },
        already_linked: currentIntegration?.external_id === String(inst.id),
      }));

      res.status(200).json({ installations: result });
    },
  );

  router.post(
    '/admin/tenants/:tenantId/github/link-installation',
    requireAdminKey,
    async (req, res) => {
      const paramResult = TenantIdParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        res.status(400).json({ error: 'INVALID_ID' });
        return;
      }

      const { tenantId } = paramResult.data;

      const { installation_id } = req.body as { installation_id?: string };
      if (!installation_id || typeof installation_id !== 'string') {
        res.status(400).json({ error: 'installation_id is required' });
        return;
      }

      const appId = process.env.GITHUB_APP_ID;
      const rawPrivateKey = process.env.GITHUB_PRIVATE_KEY;
      if (!appId || !rawPrivateKey) {
        res.status(503).json({ error: 'GitHub App not configured' });
        return;
      }
      const privateKey = rawPrivateKey.replace(/\\n/g, '\n');

      let jwt: string;
      try {
        jwt = generateAppJwt(appId, privateKey);
      } catch (err) {
        logger.error({ err, tenantId }, 'Failed to generate GitHub App JWT');
        res.status(503).json({ error: 'Failed to generate GitHub App JWT' });
        return;
      }

      try {
        const verifyResponse = await fetch(
          `https://api.github.com/app/installations/${installation_id}`,
          {
            headers: {
              Authorization: `Bearer ${jwt}`,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
            },
          },
        );

        if (!verifyResponse.ok) {
          const body = await verifyResponse.text();
          logger.warn(
            { tenantId, installation_id, status: verifyResponse.status },
            'GitHub installation not found',
          );
          res
            .status(502)
            .json({ error: `GitHub installation not found: ${verifyResponse.status} ${body}` });
          return;
        }
      } catch (err) {
        logger.error({ err, tenantId }, 'Failed to verify GitHub installation');
        res.status(502).json({ error: 'Failed to verify GitHub installation' });
        return;
      }

      try {
        await secretRepo.set(tenantId, 'github_installation_id', installation_id);
        await integrationRepo.upsert(tenantId, 'github', { external_id: installation_id });
      } catch (err) {
        logger.error({ err, tenantId }, 'Failed to store GitHub installation');
        res.status(500).json({ error: 'INTERNAL_ERROR' });
        return;
      }

      res.status(200).json({ linked: true, installation_id });
    },
  );

  router.delete(
    '/admin/tenants/:tenantId/integrations/github',
    requireAdminKey,
    async (req, res) => {
      const parsed = TenantIdParamSchema.safeParse(req.params);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid tenantId' });
        return;
      }
      const { tenantId } = parsed.data;

      try {
        await integrationRepo.delete(tenantId, 'github');
      } catch (err) {
        logger.error({ err, tenantId }, 'Failed to delete GitHub integration record');
      }

      try {
        await secretRepo.delete(tenantId, 'github_installation_id');
      } catch (err) {
        logger.error({ err, tenantId }, 'Failed to delete github_installation_id secret');
      }

      logger.info({ tenantId }, 'GitHub integration disconnected');
      res.status(200).json({ disconnected: true, tenant_id: tenantId });
    },
  );

  return router;
}
