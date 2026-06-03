import { OAuth2Client } from 'google-auth-library';
import type { PrismaClient } from '@prisma/client';
import { TenantSecretRepository } from './tenant-secret-repository.js';

export class GoogleNotConnectedError extends Error {
  readonly code = 'google_not_connected';
  constructor(tenantId: string) {
    super(`Google not connected for tenant ${tenantId}`);
    this.name = 'GoogleNotConnectedError';
  }
}

export class GoogleReauthRequiredError extends Error {
  readonly code = 'google_reauth_required';
  constructor(tenantId: string) {
    super(`Google reauth required for tenant ${tenantId} — refresh token invalid`);
    this.name = 'GoogleReauthRequiredError';
  }
}

export class GoogleWorkspaceSessionExpiredError extends Error {
  readonly code = 'google_workspace_session_expired';
  constructor(tenantId: string) {
    super(`Google Workspace session expired for tenant ${tenantId}`);
    this.name = 'GoogleWorkspaceSessionExpiredError';
  }
}

export interface GoogleTokenResult {
  token: string;
  expires_at: string;
  granted_scopes: string;
}

interface CachedGoogleToken {
  token: string;
  expires_at: string;
  granted_scopes: string;
  cachedAt: number;
}

/** 50-minute TTL — Google access tokens last 60 minutes; 10-minute buffer */
const CACHE_TTL_MS = 50 * 60 * 1000;

/** 5-minute proactive refresh buffer — avoids races near expiry boundary */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

const _tokenCache = new Map<string, CachedGoogleToken>();

/** Reset cache — for test isolation only. Do not call in production code. */
export function _resetCacheForTest(): void {
  _tokenCache.clear();
}

export async function getGoogleAccessToken(
  tenantId: string,
  prisma: PrismaClient,
): Promise<GoogleTokenResult> {
  const cached = _tokenCache.get(tenantId);
  if (cached !== undefined && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return {
      token: cached.token,
      expires_at: cached.expires_at,
      granted_scopes: cached.granted_scopes,
    };
  }

  const secretRepo = new TenantSecretRepository(prisma);
  const [accessToken, refreshToken, tokenExpiry, grantedScopes] = await Promise.all([
    secretRepo.get(tenantId, 'google_access_token'),
    secretRepo.get(tenantId, 'google_refresh_token'),
    secretRepo.get(tenantId, 'google_token_expiry'),
    secretRepo.get(tenantId, 'google_granted_scopes'),
  ]);

  if (!refreshToken) {
    throw new GoogleNotConnectedError(tenantId);
  }

  const expiryMs = tokenExpiry ? parseInt(tokenExpiry, 10) : 0;
  const isExpired = !accessToken || Date.now() + REFRESH_BUFFER_MS >= expiryMs;

  if (!isExpired && accessToken) {
    const result: GoogleTokenResult = {
      token: accessToken,
      expires_at: new Date(expiryMs).toISOString(),
      granted_scopes: grantedScopes ?? '',
    };
    _tokenCache.set(tenantId, { ...result, cachedAt: Date.now() });
    return result;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set');
  }

  const oauth2Client = new OAuth2Client({
    clientId,
    clientSecret,
    forceRefreshOnFailure: true,
  });
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  let newAccessToken: string;
  let newExpiryMs: number;

  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    if (!credentials.access_token) {
      throw new Error('No access_token in refresh response');
    }
    newAccessToken = credentials.access_token;
    newExpiryMs = credentials.expiry_date ?? Date.now() + 60 * 60 * 1000;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('invalid_grant')) {
      throw new GoogleReauthRequiredError(tenantId);
    }
    if (message.includes('invalid_rapt')) {
      throw new GoogleWorkspaceSessionExpiredError(tenantId);
    }
    throw err;
  }

  await Promise.all([
    secretRepo.set(tenantId, 'google_access_token', newAccessToken),
    secretRepo.set(tenantId, 'google_token_expiry', String(newExpiryMs)),
  ]);

  const result: GoogleTokenResult = {
    token: newAccessToken,
    expires_at: new Date(newExpiryMs).toISOString(),
    granted_scopes: grantedScopes ?? '',
  };
  _tokenCache.set(tenantId, { ...result, cachedAt: Date.now() });
  return result;
}
