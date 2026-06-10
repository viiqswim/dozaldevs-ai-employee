import { jwtVerify, createRemoteJWKSet } from 'jose';
import { detectEnvProfile, SUPABASE_JWKS_URL } from '../config.js';
import type { SupabaseJwtClaims } from './types.js';

const LOCAL_JWT_SECRET =
  process.env.GOTRUE_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long';

/**
 * Verifies a Supabase JWT using the correct algorithm for the active env profile:
 * - LOCAL (HS256): verify using GOTRUE_JWT_SECRET (shared secret)
 * - CLOUD (ES256): verify using JWKS from SUPABASE_JWKS_URL
 *
 * Throws on expired, tampered, missing sub, or wrong algorithm.
 */
export async function verifySupabaseJwt(token: string): Promise<SupabaseJwtClaims> {
  const profile = detectEnvProfile();

  let payload: Record<string, unknown>;

  if (profile === 'local') {
    const secret = new TextEncoder().encode(LOCAL_JWT_SECRET);
    const { payload: p } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    payload = p as Record<string, unknown>;
  } else {
    const JWKS = createRemoteJWKSet(new URL(SUPABASE_JWKS_URL()));
    const { payload: p } = await jwtVerify(token, JWKS, { algorithms: ['ES256'] });
    payload = p as Record<string, unknown>;
  }

  if (!payload.sub) {
    throw new Error('JWT missing sub claim');
  }

  return payload as unknown as SupabaseJwtClaims;
}
