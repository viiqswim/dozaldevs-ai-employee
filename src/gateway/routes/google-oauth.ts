import { Router } from 'express';
import crypto from 'crypto';
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import { TenantRepository } from '../services/tenant-repository.js';
import { TenantSecretRepository } from '../services/tenant-secret-repository.js';
import { TenantIntegrationRepository } from '../services/tenant-integration-repository.js';
import { signState, verifyState } from '../lib/oauth-state.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

export interface GoogleOAuthRouteOptions {
  prisma?: PrismaClient;
}

export function googleOAuthRoutes(opts: GoogleOAuthRouteOptions = {}): Router {
  const router = Router();
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  const prisma = opts.prisma ?? new PrismaClient();
  const tenantRepo = new TenantRepository(prisma);
  const secretRepo = new TenantSecretRepository(prisma);
  const integrationRepo = new TenantIntegrationRepository(prisma);

  router.get('/google/install', async (req, res) => {
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

      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) {
        res.status(400).json({ error: 'GOOGLE_CLIENT_ID not configured' });
        return;
      }

      const signingKey = process.env.ENCRYPTION_KEY ?? '';
      const nonce = crypto.randomBytes(16).toString('hex');
      const payload = JSON.stringify({ tenant_id: tenant.id, nonce });
      const state = signState(payload, signingKey);

      const redirectBase =
        process.env.GOOGLE_REDIRECT_BASE_URL ?? `http://localhost:${process.env.PORT ?? '7700'}`;
      const redirectUri = `${redirectBase}/integrations/google/callback`;

      const url =
        `${GOOGLE_AUTH_URL}` +
        `?client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(GOOGLE_SCOPES)}` +
        `&access_type=offline` +
        `&prompt=consent` +
        `&include_granted_scopes=true` +
        `&state=${encodeURIComponent(state)}`;

      res.redirect(302, url);
    } catch (err) {
      logger.error({ err }, 'Failed to generate Google install link');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.get('/google/callback', async (req, res) => {
    const { code, state, error } = req.query as {
      code?: string;
      state?: string;
      error?: string;
    };

    const redirectBase =
      process.env.GOOGLE_REDIRECT_BASE_URL ?? `http://localhost:${process.env.PORT ?? '7700'}`;

    if (error) {
      logger.warn({ error }, 'Google OAuth denied by user');
      res.redirect(302, `${redirectBase}/dashboard?error=google_denied`);
      return;
    }

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
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        res.status(503).json({ error: 'Google OAuth not configured' });
        return;
      }

      const redirectUri = `${redirectBase}/integrations/google/callback`;

      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      const tokenData = (await tokenRes.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        expiry_date?: number;
        scope?: string;
        token_type?: string;
        error?: string;
        error_description?: string;
      };

      if (!tokenData.access_token) {
        logger.error({ error: tokenData.error }, 'Google OAuth token exchange failed');
        res.status(400).json({ error: 'GOOGLE_OAUTH_FAILED', detail: tokenData.error });
        return;
      }

      const userinfoRes = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      const userinfo = (await userinfoRes.json()) as {
        sub?: string;
        email?: string;
        name?: string;
        picture?: string;
      };

      if (!userinfo.sub) {
        logger.error({ userinfo }, 'Google userinfo missing sub field');
        res.status(400).json({ error: 'GOOGLE_USERINFO_FAILED' });
        return;
      }

      const sub = userinfo.sub;

      const existingIntegration = await integrationRepo.findByExternalId('google', sub);
      if (existingIntegration && existingIntegration.tenant_id !== tenantId) {
        res.status(409).json({
          error: 'CONFLICT',
          message: 'Google account already attached to a different tenant',
        });
        return;
      }

      const tokenExpiry = String(
        tokenData.expiry_date ?? Date.now() + (tokenData.expires_in ?? 3600) * 1000,
      );

      await secretRepo.set(tenantId, 'google_access_token', tokenData.access_token);
      if (tokenData.refresh_token) {
        await secretRepo.set(tenantId, 'google_refresh_token', tokenData.refresh_token);
      }
      await secretRepo.set(tenantId, 'google_token_expiry', tokenExpiry);
      if (userinfo.email) {
        await secretRepo.set(tenantId, 'google_user_email', userinfo.email);
      }
      if (tokenData.scope) {
        await secretRepo.set(tenantId, 'google_granted_scopes', tokenData.scope);
      }

      await integrationRepo.upsert(tenantId, 'google', { external_id: sub });

      logger.info(
        { tenantId, sub, email: userinfo.email },
        'Google OAuth completed — secrets and integration stored',
      );

      res.redirect(
        302,
        `${redirectBase}/dashboard/integrations?tenant=${tenantId}&connected=google`,
      );
    } catch (err) {
      logger.error({ err }, 'Google OAuth callback failed');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  return router;
}
