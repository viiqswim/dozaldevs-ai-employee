import { Router } from 'express';
import { createLogger } from '../../lib/logger.js';
import { PrismaClient, TenantRole } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';
import { requireAuth, requireTenantRole } from '../middleware/authz.js';
import { TenantSecretRepository } from '../../repositories/tenant-secret-repository.js';
import { TenantIntegrationRepository } from '../services/tenant-integration-repository.js';
import { generateInstallationToken, generateAppJwt } from '../services/github-token-manager.js';
import { TenantIdParamSchema } from '../validation/schemas.js';
import { sendError, sendSuccess } from '../lib/http-response.js';
import { ERROR_CODES } from '../lib/prisma-helpers.js';
import { createGitHubClient } from '../../lib/github-client.js';

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
  const client = createGitHubClient({ token });
  const repos: GitHubRepo[] = [];
  let url: string | null = 'https://api.github.com/installation/repositories?per_page=100';

  while (url) {
    const { data, headers } = await client.get<GitHubInstallationReposResponse>(url);

    for (const repo of data.repositories) {
      repos.push({
        full_name: repo.full_name,
        html_url: repo.html_url,
        default_branch: repo.default_branch,
        private: repo.private,
      });
    }

    url = parseNextLink(headers.get('Link'));
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
  const logger = createLogger('admin-github');
  const prisma = opts.prisma ?? new PrismaClient();
  const secretRepo = new TenantSecretRepository(prisma);
  const integrationRepo = new TenantIntegrationRepository(prisma);

  router.get(
    '/admin/tenants/:tenantId/github/repos',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.ADMIN),
    async (req, res) => {
      const paramResult = TenantIdParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, ERROR_CODES.INVALID_ID);
        return;
      }

      const { tenantId } = paramResult.data;

      let installationId: string | null;
      try {
        installationId = await secretRepo.get(tenantId, 'github_installation_id');
      } catch (err) {
        logger.error(
          { err, tenantId },
          'Failed to read github_installation_id from tenant secrets',
        );
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
        return;
      }

      if (!installationId) {
        sendError(res, 404, 'GitHub not connected');
        return;
      }

      let token: string;
      try {
        const installationToken = await generateInstallationToken(parseInt(installationId, 10));
        token = installationToken.token;
      } catch (err) {
        logger.error({ err, tenantId }, 'Failed to generate GitHub installation token');
        sendError(res, 502, 'Failed to authenticate with GitHub');
        return;
      }

      let repos: GitHubRepo[];
      try {
        repos = await fetchAllRepos(token);
      } catch (err) {
        logger.error({ err, tenantId }, 'Failed to fetch repositories from GitHub');
        sendError(res, 502, 'Failed to fetch repositories from GitHub');
        return;
      }

      sendSuccess(res, 200, { repos });
    },
  );

  router.get(
    '/admin/tenants/:tenantId/github/available-installations',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.ADMIN),
    async (req, res) => {
      const paramResult = TenantIdParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, ERROR_CODES.INVALID_ID);
        return;
      }

      const { tenantId } = paramResult.data;

      const appId = process.env.GITHUB_APP_ID;
      const rawPrivateKey = process.env.GITHUB_PRIVATE_KEY;
      if (!appId || !rawPrivateKey) {
        sendError(res, 503, 'GitHub App not configured');
        return;
      }
      const privateKey = rawPrivateKey.replace(/\\n/g, '\n');

      let jwt: string;
      try {
        jwt = generateAppJwt(appId, privateKey);
      } catch (err) {
        logger.error({ err, tenantId }, 'Failed to generate GitHub App JWT');
        sendError(res, 503, 'Failed to generate GitHub App JWT');
        return;
      }

      const installationsClient = createGitHubClient({ token: jwt });
      const installations: GitHubInstallation[] = [];
      let url: string | null = 'https://api.github.com/app/installations?per_page=100';

      try {
        while (url) {
          const { data, headers } = await installationsClient.get<GitHubInstallation[]>(url);
          installations.push(...data);
          url = parseNextLink(headers.get('Link'));
        }
      } catch (err) {
        logger.error({ err, tenantId }, 'Failed to fetch GitHub App installations');
        sendError(res, 502, 'Failed to fetch GitHub App installations');
        return;
      }

      let currentIntegration: { external_id: string } | null = null;
      try {
        currentIntegration = await integrationRepo.findByTenantAndProvider(tenantId, 'github');
      } catch (err) {
        logger.error({ err, tenantId }, 'Failed to read tenant GitHub integration');
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
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

      sendSuccess(res, 200, { installations: result });
    },
  );

  router.post(
    '/admin/tenants/:tenantId/github/link-installation',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.OWNER),
    async (req, res) => {
      const paramResult = TenantIdParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, ERROR_CODES.INVALID_ID);
        return;
      }

      const { tenantId } = paramResult.data;

      const { installation_id } = req.body as { installation_id?: string };
      if (!installation_id || typeof installation_id !== 'string') {
        sendError(res, 400, 'installation_id is required');
        return;
      }

      const appId = process.env.GITHUB_APP_ID;
      const rawPrivateKey = process.env.GITHUB_PRIVATE_KEY;
      if (!appId || !rawPrivateKey) {
        sendError(res, 503, 'GitHub App not configured');
        return;
      }
      const privateKey = rawPrivateKey.replace(/\\n/g, '\n');

      let jwt: string;
      try {
        jwt = generateAppJwt(appId, privateKey);
      } catch (err) {
        logger.error({ err, tenantId }, 'Failed to generate GitHub App JWT');
        sendError(res, 503, 'Failed to generate GitHub App JWT');
        return;
      }

      try {
        const verifyClient = createGitHubClient({ token: jwt });
        await verifyClient.get<GitHubInstallation>(
          `https://api.github.com/app/installations/${installation_id}`,
        );
      } catch (err) {
        logger.warn({ err, tenantId, installation_id }, 'GitHub installation not found');
        sendError(res, 502, 'Failed to verify GitHub installation');
        return;
      }

      try {
        await secretRepo.set(tenantId, 'github_installation_id', installation_id);
        await integrationRepo.upsert(tenantId, 'github', { external_id: installation_id });
      } catch (err) {
        logger.error({ err, tenantId }, 'Failed to store GitHub installation');
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
        return;
      }

      sendSuccess(res, 200, { linked: true, installation_id });
    },
  );

  router.delete(
    '/admin/tenants/:tenantId/integrations/github',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.OWNER),
    async (req, res) => {
      const parsed = TenantIdParamSchema.safeParse(req.params);
      if (!parsed.success) {
        sendError(res, 400, 'Invalid tenantId');
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
      sendSuccess(res, 200, { disconnected: true, tenant_id: tenantId });
    },
  );

  return router;
}
