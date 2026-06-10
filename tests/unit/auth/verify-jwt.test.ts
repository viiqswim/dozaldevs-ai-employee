import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignJWT } from 'jose';

vi.mock('../../../src/lib/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/lib/config.js')>();
  return {
    ...actual,
    detectEnvProfile: vi.fn(() => 'local' as const),
  };
});

import { verifySupabaseJwt } from '../../../src/lib/auth/verify-jwt.js';
import { detectEnvProfile } from '../../../src/lib/config.js';

const LOCAL_SECRET = new TextEncoder().encode(
  'super-secret-jwt-token-with-at-least-32-characters-long',
);

async function signLocalToken(
  payload: Record<string, unknown>,
  expirationTime = '1h',
): Promise<string> {
  const builder = new SignJWT(payload).setProtectedHeader({ alg: 'HS256' });
  if (expirationTime) {
    builder.setExpirationTime(expirationTime);
  }
  return builder.sign(LOCAL_SECRET);
}

describe('verifySupabaseJwt — LOCAL profile', () => {
  beforeEach(() => {
    vi.mocked(detectEnvProfile).mockReturnValue('local');
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_ANON_KEY = 'eyJfake';
  });

  it('valid LOCAL token returns claims with sub', async () => {
    const token = await signLocalToken({
      sub: 'user-123',
      email: 'test@example.com',
      role: 'authenticated',
      aud: 'authenticated',
    });

    const claims = await verifySupabaseJwt(token);

    expect(claims.sub).toBe('user-123');
    expect(claims.email).toBe('test@example.com');
    expect(claims.role).toBe('authenticated');
  });

  it('expired token throws', async () => {
    const token = await new SignJWT({
      sub: 'user-123',
      email: 'test@example.com',
      role: 'authenticated',
      aud: 'authenticated',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(LOCAL_SECRET);

    await expect(verifySupabaseJwt(token)).rejects.toThrow();
  });

  it('tampered token throws', async () => {
    const token = await signLocalToken({
      sub: 'user-123',
      role: 'authenticated',
      aud: 'authenticated',
    });

    const parts = token.split('.');
    const tamperedSignature = parts[2].slice(0, -4) + 'XXXX';
    const tampered = `${parts[0]}.${parts[1]}.${tamperedSignature}`;

    await expect(verifySupabaseJwt(tampered)).rejects.toThrow();
  });

  it('token missing sub throws', async () => {
    const token = await new SignJWT({
      email: 'test@example.com',
      role: 'authenticated',
      aud: 'authenticated',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(LOCAL_SECRET);

    await expect(verifySupabaseJwt(token)).rejects.toThrow('JWT missing sub claim');
  });
});
