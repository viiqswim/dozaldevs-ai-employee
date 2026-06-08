import { Router } from 'express';
import crypto from 'crypto';
import { createLogger } from '../../lib/logger.js';
import { PrismaClient } from '@prisma/client';
import { TenantRepository } from '../services/tenant-repository.js';
import { TenantSecretRepository } from '../services/tenant-secret-repository.js';
import { TenantIntegrationRepository } from '../services/tenant-integration-repository.js';
import { NOTION_AUTH_URL, NOTION_TOKEN_URL } from '../../lib/notion-types.js';
import { signState, verifyState } from '../lib/oauth-state.js';
import { sendError } from '../lib/http-response.js';

export interface NotionOAuthRouteOptions {
  prisma?: PrismaClient;
}

export function notionOAuthRoutes(opts: NotionOAuthRouteOptions = {}): Router {
  const router = Router();
  const logger = createLogger('notion-oauth');
  const prisma = opts.prisma ?? new PrismaClient();
  const tenantRepo = new TenantRepository(prisma);
  const secretRepo = new TenantSecretRepository(prisma);
  const integrationRepo = new TenantIntegrationRepository(prisma);

  router.get('/notion/install', async (req, res) => {
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

      const clientId = process.env.NOTION_CLIENT_ID;
      if (!clientId) {
        sendError(res, 400, 'NOTION_CLIENT_ID not configured');
        return;
      }

      const signingKey = process.env.ENCRYPTION_KEY ?? '';
      const nonce = crypto.randomBytes(16).toString('hex');
      const payload = JSON.stringify({ tenant_id: tenant.id, nonce });
      const state = signState(payload, signingKey);

      const redirectBase =
        process.env.NOTION_REDIRECT_BASE_URL ?? `http://localhost:${process.env.PORT ?? '7700'}`;
      const redirectUri = `${redirectBase}/integrations/notion/callback`;

      const url =
        `${NOTION_AUTH_URL}` +
        `?client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&owner=user` +
        `&state=${encodeURIComponent(state)}`;

      res.redirect(302, url);
    } catch (err) {
      logger.error({ err }, 'Failed to generate Notion install link');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  router.get('/notion/callback', async (req, res) => {
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
      const clientId = process.env.NOTION_CLIENT_ID;
      const clientSecret = process.env.NOTION_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        sendError(res, 503, 'Notion OAuth not configured');
        return;
      }

      const redirectBase =
        process.env.NOTION_REDIRECT_BASE_URL ?? `http://localhost:${process.env.PORT ?? '7700'}`;
      const redirectUri = `${redirectBase}/integrations/notion/callback`;

      const basicCredentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const tokenRes = await fetch(NOTION_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${basicCredentials}`,
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
      });

      const tokenData = (await tokenRes.json()) as {
        access_token?: string;
        refresh_token?: string;
        token_type?: string;
        bot_id?: string;
        workspace_id?: string;
        workspace_name?: string;
        workspace_icon?: string;
        owner?: unknown;
        error?: string;
        error_description?: string;
      };

      if (!tokenData.access_token || !tokenData.workspace_id) {
        logger.error({ error: tokenData.error }, 'Notion OAuth token exchange failed');
        sendError(res, 400, 'NOTION_OAUTH_FAILED', undefined, { detail: tokenData.error });
        return;
      }

      const { workspace_id: workspaceId, workspace_name: workspaceName } = tokenData;

      const existingIntegration = await integrationRepo.findByExternalId('notion', workspaceId);
      if (existingIntegration && existingIntegration.tenant_id !== tenantId) {
        sendError(res, 409, 'CONFLICT', 'Notion workspace already attached to a different tenant');
        return;
      }

      await secretRepo.set(tenantId, 'notion_access_token', tokenData.access_token);
      if (tokenData.refresh_token) {
        await secretRepo.set(tenantId, 'notion_refresh_token', tokenData.refresh_token);
      }
      await secretRepo.set(tenantId, 'notion_workspace_id', workspaceId);
      if (workspaceName) {
        await secretRepo.set(tenantId, 'notion_workspace_name', workspaceName);
      }

      await integrationRepo.upsert(tenantId, 'notion', { external_id: workspaceId });

      logger.info(
        { tenantId, workspaceId },
        'Notion OAuth completed — secrets and integration stored',
      );

      const dashboardUrl = `${redirectBase}/dashboard/`;
      res.redirect(302, dashboardUrl);
    } catch (err) {
      logger.error({ err }, 'Notion OAuth callback failed');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  return router;
}
