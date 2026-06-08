import crypto from 'crypto';

interface CachedToken {
  token: string;
  expires_at: string;
  cachedAt: number;
}

export interface InstallationToken {
  token: string;
  expires_at: string;
}

/** 55-minute TTL — GitHub tokens last 60 minutes; 5-minute buffer to avoid races */
const CACHE_TTL_MS = 55 * 60 * 1000;

const _tokenCache = new Map<number, CachedToken>();

/** Reset cache — for test isolation only. Do not call in production code. */
export function _resetCacheForTest(): void {
  _tokenCache.clear();
}

export function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function generateAppJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iat: now - 60, // 60s in the past to account for clock skew between servers
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

export async function generateInstallationToken(
  installationId: number,
): Promise<InstallationToken> {
  const appId = process.env.GITHUB_APP_ID;
  if (!appId) {
    throw new Error('GITHUB_APP_ID environment variable is not set');
  }

  const privateKey = process.env.GITHUB_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('GITHUB_PRIVATE_KEY environment variable is not set');
  }

  // Normalize literal \n (two chars: backslash + n) to real newlines.
  // .env files store the PEM key with escaped newlines; Node's process.env
  // does not expand them, so crypto.createSign receives a malformed PEM
  // and throws ERR_OSSL_UNSUPPORTED without this normalization.
  const normalizedKey = privateKey.replace(/\\n/g, '\n');

  const cached = _tokenCache.get(installationId);
  if (cached !== undefined && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return { token: cached.token, expires_at: cached.expires_at };
  }

  const jwt = generateAppJwt(appId, normalizedKey);

  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub API returned ${response.status} for installation ${installationId}: ${body}`,
    );
  }

  const data = (await response.json()) as { token: string; expires_at: string };
  const result: InstallationToken = { token: data.token, expires_at: data.expires_at };

  _tokenCache.set(installationId, {
    token: result.token,
    expires_at: result.expires_at,
    cachedAt: Date.now(),
  });

  return result;
}
