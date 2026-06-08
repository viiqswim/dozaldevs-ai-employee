import { Router } from 'express';
import crypto from 'crypto';
import { createLogger } from '../../lib/logger.js';
import { PrismaClient } from '@prisma/client';
import { TenantRepository } from '../services/tenant-repository.js';
import { TenantSecretRepository } from '../services/tenant-secret-repository.js';
import { TenantIntegrationRepository } from '../services/tenant-integration-repository.js';
import { signState, verifyState } from '../lib/oauth-state.js';
import { sendError } from '../lib/http-response.js';

export interface GitHubOAuthRouteOptions {
  prisma?: PrismaClient;
}

export function githubOAuthRoutes(opts: GitHubOAuthRouteOptions = {}): Router {
  const router = Router();
  const logger = createLogger('github-oauth');
  const prisma = opts.prisma ?? new PrismaClient();
  const tenantRepo = new TenantRepository(prisma);
  const secretRepo = new TenantSecretRepository(prisma);
  const integrationRepo = new TenantIntegrationRepository(prisma);

  router.get('/', (req, res, next) => {
    const { installation_id, state } = req.query;
    if (installation_id && state) {
      logger.warn(
        'GitHub App callback hit /integrations instead of /integrations/github/callback — redirecting',
      );
      const params = new URLSearchParams(req.query as Record<string, string>);
      res.redirect(302, `/integrations/github/callback?${params.toString()}`);
      return;
    }
    next();
  });

  router.get('/github/install', async (req, res) => {
    const tenantSlug = req.query['tenant'];
    if (!tenantSlug || typeof tenantSlug !== 'string') {
      sendError(res, 400, 'MISSING_TENANT');
      return;
    }

    try {
      const tenant = await tenantRepo.findBySlug(tenantSlug);
      if (!tenant) {
        sendError(res, 400, 'TENANT_NOT_FOUND');
        return;
      }

      const appName = process.env.GITHUB_APP_NAME;
      if (!appName) {
        logger.error('GITHUB_APP_NAME not configured — GitHub App install unavailable');
        sendError(res, 503, 'GITHUB_APP_NAME not configured');
        return;
      }

      const signingKey = process.env.ENCRYPTION_KEY ?? '';
      const nonce = crypto.randomBytes(16).toString('hex');
      const payload = JSON.stringify({ tenant_id: tenant.id, nonce });
      const state = signState(payload, signingKey);

      const url =
        `https://github.com/apps/${appName}/installations/new` +
        `?state=${encodeURIComponent(state)}`;

      res.redirect(302, url);
    } catch (err) {
      logger.error({ err }, 'Failed to generate GitHub App install link');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  /**
   * GET /integrations/github/callback?installation_id=...&setup_action=install&state=...
   *
   * NOTE: This is NOT OAuth2. GitHub App callback carries an installation_id, not a code.
   * There is no token exchange — just verify the HMAC state and store the installation_id.
   */
  router.get('/github/callback', async (req, res) => {
    const { installation_id, setup_action, state } = req.query as {
      installation_id?: string;
      setup_action?: string;
      state?: string;
    };

    if (!installation_id || !state) {
      sendError(res, 400, 'MISSING_PARAMS');
      return;
    }

    const signingKey = process.env.ENCRYPTION_KEY ?? '';
    let parsed: ReturnType<typeof verifyState>;
    try {
      parsed = verifyState(state, signingKey);
    } catch {
      parsed = null;
    }
    if (!parsed) {
      sendError(res, 400, 'INVALID_STATE');
      return;
    }

    const { tenant_id: tenantId } = parsed;

    try {
      await secretRepo.set(tenantId, 'github_installation_id', installation_id);
      await integrationRepo.upsert(tenantId, 'github', { external_id: installation_id });

      logger.info(
        { tenantId, installationId: installation_id, setup_action },
        'GitHub App installed — installation_id stored',
      );

      res.redirect(302, `/dashboard/integrations?tenant=${tenantId}&connected=github`);
    } catch (err) {
      logger.error({ err }, 'GitHub App callback failed');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  return router;
}
