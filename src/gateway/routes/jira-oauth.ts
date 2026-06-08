import { Router } from 'express';
import crypto from 'crypto';
import { createLogger } from '../../lib/logger.js';
import { PrismaClient } from '@prisma/client';
import { TenantRepository } from '../services/tenant-repository.js';
import { TenantSecretRepository } from '../services/tenant-secret-repository.js';
import { TenantIntegrationRepository } from '../services/tenant-integration-repository.js';
import {
  JIRA_AUTH_URL,
  JIRA_TOKEN_URL,
  JIRA_ACCESSIBLE_RESOURCES_URL,
  JIRA_REQUIRED_SCOPES,
} from '../../lib/jira-types.js';
import { signState, verifyState } from '../lib/oauth-state.js';
import { sendError } from '../lib/http-response.js';

export interface JiraOAuthRouteOptions {
  prisma?: PrismaClient;
}

export function jiraOAuthRoutes(opts: JiraOAuthRouteOptions = {}): Router {
  const router = Router();
  const logger = createLogger('jira-oauth');
  const prisma = opts.prisma ?? new PrismaClient();
  const tenantRepo = new TenantRepository(prisma);
  const secretRepo = new TenantSecretRepository(prisma);
  const integrationRepo = new TenantIntegrationRepository(prisma);

  router.get('/jira/install', async (req, res) => {
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

      const clientId = process.env.JIRA_CLIENT_ID;
      if (!clientId) {
        sendError(res, 503, 'JIRA_CLIENT_ID not configured');
        return;
      }

      const signingKey = process.env.ENCRYPTION_KEY ?? '';
      const nonce = crypto.randomBytes(16).toString('hex');
      const payload = JSON.stringify({ tenant_id: tenant.id, nonce });
      const state = signState(payload, signingKey);

      const redirectBase =
        process.env.JIRA_REDIRECT_BASE_URL ?? `http://localhost:${process.env.PORT ?? '7700'}`;
      const redirectUri = `${redirectBase}/integrations/jira/callback`;

      const url =
        `${JIRA_AUTH_URL}` +
        `?audience=${encodeURIComponent('api.atlassian.com')}` +
        `&client_id=${encodeURIComponent(clientId)}` +
        `&scope=${encodeURIComponent(JIRA_REQUIRED_SCOPES)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&state=${encodeURIComponent(state)}` +
        `&response_type=code` +
        `&prompt=consent`;

      res.redirect(302, url);
    } catch (err) {
      logger.error({ err }, 'Failed to generate Jira install link');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  router.get('/jira/callback', async (req, res) => {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state) {
      sendError(res, 400, 'MISSING_PARAMS');
      return;
    }

    const signingKey = process.env.ENCRYPTION_KEY ?? '';
    const parsed = verifyState(state, signingKey);
    if (!parsed) {
      sendError(res, 400, 'INVALID_STATE');
      return;
    }

    const { tenant_id: tenantId } = parsed;

    try {
      const clientId = process.env.JIRA_CLIENT_ID;
      const clientSecret = process.env.JIRA_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        sendError(res, 503, 'Jira OAuth not configured');
        return;
      }

      const redirectBase =
        process.env.JIRA_REDIRECT_BASE_URL ?? `http://localhost:${process.env.PORT ?? '7700'}`;
      const redirectUri = `${redirectBase}/integrations/jira/callback`;

      const tokenRes = await fetch(JIRA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      });

      const tokenData = (await tokenRes.json()) as {
        access_token?: string;
        refresh_token?: string;
        error?: string;
        error_description?: string;
      };

      if (!tokenData.access_token) {
        logger.error({ error: tokenData.error }, 'Jira OAuth token exchange failed');
        sendError(res, 400, 'JIRA_OAUTH_FAILED', undefined, { detail: tokenData.error });
        return;
      }

      const resourcesRes = await fetch(JIRA_ACCESSIBLE_RESOURCES_URL, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: 'application/json',
        },
      });

      const resources = (await resourcesRes.json()) as Array<{
        id: string;
        url: string;
        name: string;
      }>;

      if (!Array.isArray(resources) || resources.length === 0) {
        logger.error({}, 'No accessible Jira resources found');
        sendError(res, 400, 'NO_ACCESSIBLE_RESOURCES');
        return;
      }

      const { id: cloudId, url: siteUrl } = resources[0];

      await secretRepo.set(tenantId, 'jira_access_token', tokenData.access_token);
      if (tokenData.refresh_token) {
        await secretRepo.set(tenantId, 'jira_refresh_token', tokenData.refresh_token);
      }
      await secretRepo.set(tenantId, 'jira_cloud_id', cloudId);
      await secretRepo.set(tenantId, 'jira_site_url', siteUrl);

      await integrationRepo.upsert(tenantId, 'jira', { external_id: cloudId });

      logger.info({ tenantId, cloudId }, 'Jira OAuth completed — secrets and integration stored');

      const dashboardUrl = `${redirectBase}/dashboard/`;
      res.redirect(302, dashboardUrl);
    } catch (err) {
      logger.error({ err }, 'Jira OAuth callback failed');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  return router;
}
