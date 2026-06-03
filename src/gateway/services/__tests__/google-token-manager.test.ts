import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getGoogleAccessToken,
  GoogleNotConnectedError,
  GoogleReauthRequiredError,
  _resetCacheForTest,
} from '../google-token-manager.js';

// Mock TenantSecretRepository
const mockGet = vi.fn();
const mockSet = vi.fn();

vi.mock('../tenant-secret-repository.js', () => ({
  TenantSecretRepository: vi.fn().mockImplementation(() => ({
    get: mockGet,
    set: mockSet,
  })),
}));

// Mock OAuth2Client
const mockSetCredentials = vi.fn();
const mockRefreshAccessToken = vi.fn();

vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    setCredentials: mockSetCredentials,
    refreshAccessToken: mockRefreshAccessToken,
  })),
}));

const TENANT_ID = 'tenant-test-1';
const MOCK_PRISMA = {} as Parameters<typeof getGoogleAccessToken>[1];

// Future expiry (1 hour from a fixed point)
const FUTURE_EXPIRY_MS = Date.now() + 60 * 60 * 1000;

beforeEach(() => {
  _resetCacheForTest();
  vi.clearAllMocks();
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
});

describe('getGoogleAccessToken()', () => {
  it('throws GoogleNotConnectedError when google_refresh_token is not set', async () => {
    // All secrets return null — no refresh token
    mockGet.mockResolvedValue(null);

    await expect(getGoogleAccessToken(TENANT_ID, MOCK_PRISMA)).rejects.toThrow(
      GoogleNotConnectedError,
    );
  });

  it('returns cached token without hitting DB on second call', async () => {
    // First call: valid non-expired token in DB
    mockGet.mockImplementation((_tenantId: string, key: string) => {
      if (key === 'google_refresh_token') return Promise.resolve('refresh-token-abc');
      if (key === 'google_access_token') return Promise.resolve('access-token-xyz');
      if (key === 'google_token_expiry') return Promise.resolve(String(FUTURE_EXPIRY_MS));
      if (key === 'google_granted_scopes') return Promise.resolve('email profile');
      return Promise.resolve(null);
    });

    const first = await getGoogleAccessToken(TENANT_ID, MOCK_PRISMA);
    const callCountAfterFirst = mockGet.mock.calls.length;

    const second = await getGoogleAccessToken(TENANT_ID, MOCK_PRISMA);

    // DB should NOT be called again on second call
    expect(mockGet.mock.calls.length).toBe(callCountAfterFirst);
    expect(second.token).toBe(first.token);
    expect(second.token).toBe('access-token-xyz');
  });

  it('fetches fresh token after cache TTL expires', async () => {
    vi.useFakeTimers();

    mockGet.mockImplementation((_tenantId: string, key: string) => {
      if (key === 'google_refresh_token') return Promise.resolve('refresh-token-abc');
      if (key === 'google_access_token') return Promise.resolve('access-token-xyz');
      // Expiry far in the future relative to fake timer
      if (key === 'google_token_expiry')
        return Promise.resolve(String(Date.now() + 60 * 60 * 1000));
      if (key === 'google_granted_scopes') return Promise.resolve('email');
      return Promise.resolve(null);
    });

    // First call — populates cache
    await getGoogleAccessToken(TENANT_ID, MOCK_PRISMA);
    const callsAfterFirst = mockGet.mock.calls.length;

    // Advance past 50-minute TTL
    vi.advanceTimersByTime(51 * 60 * 1000);

    // Second call — cache expired, DB must be hit again
    await getGoogleAccessToken(TENANT_ID, MOCK_PRISMA);

    expect(mockGet.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('persists refreshed access_token and token_expiry to tenant_secrets', async () => {
    const expiredExpiry = Date.now() - 1000; // already expired

    mockGet.mockImplementation((_tenantId: string, key: string) => {
      if (key === 'google_refresh_token') return Promise.resolve('refresh-token-abc');
      if (key === 'google_access_token') return Promise.resolve('old-access-token');
      if (key === 'google_token_expiry') return Promise.resolve(String(expiredExpiry));
      if (key === 'google_granted_scopes') return Promise.resolve('email');
      return Promise.resolve(null);
    });

    const newExpiry = Date.now() + 60 * 60 * 1000;
    mockRefreshAccessToken.mockResolvedValue({
      credentials: {
        access_token: 'new-access-token',
        expiry_date: newExpiry,
      },
    });
    mockSet.mockResolvedValue(undefined);

    const result = await getGoogleAccessToken(TENANT_ID, MOCK_PRISMA);

    expect(result.token).toBe('new-access-token');

    // Must persist access_token and token_expiry
    const setCalls = mockSet.mock.calls.map((c) => c[1]); // second arg is the key
    expect(setCalls).toContain('google_access_token');
    expect(setCalls).toContain('google_token_expiry');

    // Must NOT persist refresh_token
    expect(setCalls).not.toContain('google_refresh_token');
  });

  it('throws GoogleReauthRequiredError when refresh returns invalid_grant', async () => {
    const expiredExpiry = Date.now() - 1000;

    mockGet.mockImplementation((_tenantId: string, key: string) => {
      if (key === 'google_refresh_token') return Promise.resolve('refresh-token-abc');
      if (key === 'google_access_token') return Promise.resolve('old-access-token');
      if (key === 'google_token_expiry') return Promise.resolve(String(expiredExpiry));
      if (key === 'google_granted_scopes') return Promise.resolve('email');
      return Promise.resolve(null);
    });

    mockRefreshAccessToken.mockRejectedValue(new Error('invalid_grant'));

    await expect(getGoogleAccessToken(TENANT_ID, MOCK_PRISMA)).rejects.toThrow(
      GoogleReauthRequiredError,
    );
  });
});
