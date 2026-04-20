import { Router } from 'express';
import crypto from 'crypto';
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import { TenantRepository } from '../services/tenant-repository.js';
import { TenantSecretRepository } from '../services/tenant-secret-repository.js';
import { TenantIntegrationRepository } from '../services/tenant-integration-repository.js';
import { TenantIdParamSchema } from '../validation/schemas.js';

export interface SlackOAuthRouteOptions {
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

export function slackOAuthRoutes(opts: SlackOAuthRouteOptions = {}): Router {
  const router = Router();
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  const prisma = opts.prisma ?? new PrismaClient();
  const tenantRepo = new TenantRepository(prisma);
  const secretRepo = new TenantSecretRepository(prisma);
  const integrationRepo = new TenantIntegrationRepository(prisma);

  router.get('/slack/install', async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse({ tenantId: req.query['tenant'] });
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_TENANT_ID' });
      return;
    }
    const tenantId = paramResult.data.tenantId;
    try {
      const tenant = await tenantRepo.findById(tenantId);
      if (!tenant) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }
      const clientId = process.env.SLACK_CLIENT_ID;
      if (!clientId) {
        res.status(500).json({ error: 'SLACK_CLIENT_ID not configured' });
        return;
      }
      const signingKey = process.env.ENCRYPTION_KEY ?? '';
      const nonce = crypto.randomBytes(16).toString('hex');
      const payload = JSON.stringify({ tenant_id: tenantId, nonce });
      const state = signState(payload, signingKey);
      const redirectBase =
        process.env.SLACK_REDIRECT_BASE_URL ?? `http://localhost:${process.env.PORT ?? '7700'}`;
      const redirectUri = `${redirectBase}/slack/oauth_callback`;
      const scopes = 'channels:history,groups:history,groups:read,chat:write,chat:write.public';
      const url =
        `https://slack.com/oauth/v2/authorize` +
        `?client_id=${encodeURIComponent(clientId)}` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&state=${encodeURIComponent(state)}`;
      res.redirect(302, url);
    } catch (err) {
      logger.error({ err }, 'Failed to generate install link');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.get('/slack/oauth_callback', async (req, res) => {
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
      const clientId = process.env.SLACK_CLIENT_ID;
      const clientSecret = process.env.SLACK_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        res.status(500).json({ error: 'Slack OAuth not configured' });
        return;
      }
      const redirectBase =
        process.env.SLACK_REDIRECT_BASE_URL ?? `http://localhost:${process.env.PORT ?? '7700'}`;
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
        res.status(400).json({ error: 'SLACK_OAUTH_FAILED', detail: tokenData.error });
        return;
      }
      const teamId = tokenData.team.id;
      const teamName = tokenData.team.name;
      const accessToken = tokenData.access_token;
      const existingIntegration = await integrationRepo.findByExternalId('slack', teamId);
      if (existingIntegration && existingIntegration.tenant_id !== tenantId) {
        res.status(409).json({
          error: 'CONFLICT',
          message: 'Slack workspace already attached to a different tenant',
        });
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
        res.status(409).json({
          error: 'CONFLICT',
          message: 'Slack workspace already attached to a different tenant',
        });
        return;
      }
      logger.error({ err }, 'OAuth callback failed');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  return router;
}
