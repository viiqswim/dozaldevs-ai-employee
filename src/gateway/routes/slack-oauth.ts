import { Router } from 'express';
import crypto from 'crypto';
import { createLogger } from '../../lib/logger.js';
import { PrismaClient } from '@prisma/client';
import { TenantRepository } from '../../repositories/tenant-repository.js';
import { TenantSecretRepository } from '../../repositories/tenant-secret-repository.js';
import { TenantIntegrationRepository } from '../services/tenant-integration-repository.js';
import { TenantIdParamSchema } from '../validation/schemas.js';
import { signState, verifyState } from '../lib/oauth-state.js';
import { sendError } from '../lib/http-response.js';
import {
  SLACK_CLIENT_ID,
  SLACK_CLIENT_SECRET,
  SLACK_REDIRECT_BASE_URL,
  ENCRYPTION_KEY,
} from '../../lib/config.js';

export interface SlackOAuthRouteOptions {
  prisma?: PrismaClient;
}

export function slackOAuthRoutes(opts: SlackOAuthRouteOptions = {}): Router {
  const router = Router();
  const logger = createLogger('slack-oauth');
  const prisma = opts.prisma ?? new PrismaClient();
  const tenantRepo = new TenantRepository(prisma);
  const secretRepo = new TenantSecretRepository(prisma);
  const integrationRepo = new TenantIntegrationRepository(prisma);

  router.get('/slack/install', async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse({ tenantId: req.query['tenant'] });
    if (!paramResult.success) {
      sendError(res, 400, 'INVALID_TENANT_ID');
      return;
    }
    const tenantId = paramResult.data.tenantId;
    try {
      const tenant = await tenantRepo.findById(tenantId);
      if (!tenant) {
        sendError(res, 404, 'NOT_FOUND');
        return;
      }
      const clientId = SLACK_CLIENT_ID();
      if (!clientId) {
        sendError(res, 500, 'SLACK_CLIENT_ID not configured');
        return;
      }
      const signingKey = ENCRYPTION_KEY();
      const nonce = crypto.randomBytes(16).toString('hex');
      const payload = JSON.stringify({ tenant_id: tenantId, nonce });
      const state = signState(payload, signingKey);
      const redirectBase = SLACK_REDIRECT_BASE_URL();
      const redirectUri = `${redirectBase}/slack/oauth_callback`;
      const scopes =
        'channels:history,channels:read,groups:history,groups:read,chat:write,chat:write.public';
      const url =
        `https://slack.com/oauth/v2/authorize` +
        `?client_id=${encodeURIComponent(clientId)}` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&state=${encodeURIComponent(state)}`;
      res.redirect(302, url);
    } catch (err) {
      logger.error({ err }, 'Failed to generate install link');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  router.get('/slack/oauth_callback', async (req, res) => {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state) {
      sendError(res, 400, 'MISSING_PARAMS');
      return;
    }
    const signingKey = ENCRYPTION_KEY();
    const parsed = verifyState(state, signingKey);
    if (!parsed) {
      sendError(res, 400, 'INVALID_STATE');
      return;
    }
    const { tenant_id: tenantId } = parsed;
    try {
      const clientId = SLACK_CLIENT_ID();
      const clientSecret = SLACK_CLIENT_SECRET();
      if (!clientId || !clientSecret) {
        sendError(res, 500, 'Slack OAuth not configured');
        return;
      }
      const redirectBase = SLACK_REDIRECT_BASE_URL();
      const redirectUri = `${redirectBase}/slack/oauth_callback`;
      const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }).toString(),
      });
      const tokenData = (await tokenRes.json()) as {
        ok: boolean;
        access_token?: string;
        team?: { id: string; name: string };
        bot_user_id?: string;
        error?: string;
      };
      if (!tokenData.ok || !tokenData.access_token || !tokenData.team) {
        logger.error({ slackError: tokenData.error }, 'Slack OAuth token exchange failed');
        sendError(res, 400, 'SLACK_OAUTH_FAILED', undefined, { detail: tokenData.error });
        return;
      }
      const teamId = tokenData.team.id;
      const teamName = tokenData.team.name;
      const accessToken = tokenData.access_token;
      const existingIntegration = await integrationRepo.findByExternalId('slack', teamId);
      if (existingIntegration && existingIntegration.tenant_id !== tenantId) {
        sendError(res, 409, 'CONFLICT', 'Slack workspace already attached to a different tenant');
        return;
      }
      await secretRepo.set(tenantId, 'slack_bot_token', accessToken);
      await integrationRepo.upsert(tenantId, 'slack', { external_id: teamId });
      logger.info({ tenantId, teamId }, 'Slack OAuth completed — secret and integration stored');
      res
        .status(200)
        .send(
          `<html><body><h2>Connected to ${teamName}. You can close this tab.</h2></body></html>`,
        );
    } catch (err) {
      if (
        err instanceof Error &&
        (err as NodeJS.ErrnoException & { code?: string }).code === 'DUPLICATE_TEAM'
      ) {
        sendError(res, 409, 'CONFLICT', 'Slack workspace already attached to a different tenant');
        return;
      }
      logger.error({ err }, 'OAuth callback failed');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  return router;
}
