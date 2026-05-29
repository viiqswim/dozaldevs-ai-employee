import { Router } from 'express';
import crypto from 'crypto';
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import { TenantRepository } from '../services/tenant-repository.js';
import { TenantSecretRepository } from '../services/tenant-secret-repository.js';
import { TenantIntegrationRepository } from '../services/tenant-integration-repository.js';
import { NOTION_AUTH_URL, NOTION_TOKEN_URL } from '../../lib/notion-types.js';

export interface NotionOAuthRouteOptions {
  prisma?: PrismaClient;
}

function signState(payload: string, key: string): string {
  const b64 = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', key).update(b64).digest('hex');
  return `${b64}.${sig}`;
}

function verifyState(signed: string, key: string): { tenant_id: string; nonce: string } | null {
  const dot = signed.lastIndexOf('.');
  if (dot === -1) return null;
  const b64 = signed.slice(0, dot);
  const sig = signed.slice(dot + 1);
  const expected = crypto.createHmac('sha256', key).update(b64).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
  try {
    return JSON.parse(Buffer.from(b64, 'base64url').toString('utf8')) as {
      tenant_id: string;
      nonce: string;
    };
  } catch {
    return null;
  }
}

export function notionOAuthRoutes(opts: NotionOAuthRouteOptions = {}): Router {
  const router = Router();
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  const prisma = opts.prisma ?? new PrismaClient();
  const tenantRepo = new TenantRepository(prisma);
  const secretRepo = new TenantSecretRepository(prisma);
  const integrationRepo = new TenantIntegrationRepository(prisma);

  router.get('/notion/install', async (req, res) => {
    const tenantSlug = req.query['tenant'];
    if (!tenantSlug || typeof tenantSlug !== 'string') {
      res.status(400).json({ error: 'MISSING_TENANT' });
      return;
    }

    try {
      const tenant = await tenantRepo.findBySlug(tenantSlug);
      if (!tenant) {
        res.status(400).json({ error: 'TENANT_NOT_FOUND' });
        return;
      }

      const clientId = process.env.NOTION_CLIENT_ID;
      if (!clientId) {
        res.status(400).json({ error: 'NOTION_CLIENT_ID not configured' });
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
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.get('/notion/callback', async (req, res) => {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state) {
      res.status(400).json({ error: 'MISSING_PARAMS' });
      return;
    }

    const signingKey = process.env.ENCRYPTION_KEY ?? '';
    const parsed = verifyState(state, signingKey);
    if (!parsed) {
      res.status(400).json({ error: 'INVALID_STATE' });
      return;
    }

    const { tenant_id: tenantId } = parsed;

    try {
      const clientId = process.env.NOTION_CLIENT_ID;
      const clientSecret = process.env.NOTION_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        res.status(503).json({ error: 'Notion OAuth not configured' });
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
        res.status(400).json({ error: 'NOTION_OAUTH_FAILED', detail: tokenData.error });
        return;
      }

      const { workspace_id: workspaceId, workspace_name: workspaceName } = tokenData;

      const existingIntegration = await integrationRepo.findByExternalId('notion', workspaceId);
      if (existingIntegration && existingIntegration.tenant_id !== tenantId) {
        res.status(409).json({
          error: 'CONFLICT',
          message: 'Notion workspace already attached to a different tenant',
        });
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
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  return router;
}
