import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { generateInstallationToken, _resetCacheForTest } from '../github-token-manager.js';

let TEST_PRIVATE_KEY: string;

beforeAll(() => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 1024,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  TEST_PRIVATE_KEY = privateKey;
});

afterEach(() => {
  _resetCacheForTest();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete process.env.GITHUB_APP_ID;
  delete process.env.GITHUB_PRIVATE_KEY;
});

function makeOkResponse(token = 'ghs_test123', expires_at = '2099-01-01T00:00:00Z') {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({ token, expires_at }),
    text: vi.fn().mockResolvedValue(''),
  };
}

describe('generateInstallationToken()', () => {
  describe('env var validation', () => {
    it('throws when GITHUB_APP_ID is not set', async () => {
      process.env.GITHUB_PRIVATE_KEY = TEST_PRIVATE_KEY;
      await expect(generateInstallationToken(123)).rejects.toThrow(
        'GITHUB_APP_ID environment variable is not set',
      );
    });

    it('throws when GITHUB_PRIVATE_KEY is not set', async () => {
      process.env.GITHUB_APP_ID = 'app-test-123';
      await expect(generateInstallationToken(123)).rejects.toThrow(
        'GITHUB_PRIVATE_KEY environment variable is not set',
      );
    });
  });

  describe('token generation', () => {
    beforeEach(() => {
      process.env.GITHUB_APP_ID = 'app-test-123';
      process.env.GITHUB_PRIVATE_KEY = TEST_PRIVATE_KEY;
    });

    it('returns token and expires_at on success', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(makeOkResponse('ghs_abc', '2099-06-01T00:00:00Z')),
      );

      const result = await generateInstallationToken(42);

      expect(result).toEqual({ token: 'ghs_abc', expires_at: '2099-06-01T00:00:00Z' });
    });

    it('calls the correct GitHub API endpoint with required headers', async () => {
      const mockFetch = vi.fn().mockResolvedValue(makeOkResponse());
      vi.stubGlobal('fetch', mockFetch);

      await generateInstallationToken(99);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/app/installations/99/access_tokens',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          }),
        }),
      );
    });

    it('includes a Bearer JWT in the Authorization header', async () => {
      const mockFetch = vi.fn().mockResolvedValue(makeOkResponse());
      vi.stubGlobal('fetch', mockFetch);

      await generateInstallationToken(42);

      const calledHeaders = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(calledHeaders['Authorization']).toMatch(/^Bearer .+\..+\..+$/);
    });

    it('throws a descriptive error when GitHub API returns a non-2xx status', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          text: vi.fn().mockResolvedValue('Bad credentials'),
        }),
      );

      await expect(generateInstallationToken(42)).rejects.toThrow(
        'GitHub API returned 401 for installation 42: Bad credentials',
      );
    });
  });

  describe('caching', () => {
    beforeEach(() => {
      process.env.GITHUB_APP_ID = 'app-test-123';
      process.env.GITHUB_PRIVATE_KEY = TEST_PRIVATE_KEY;
    });

    it('returns cached token on second call without hitting GitHub API again', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(makeOkResponse('ghs_cached', '2099-01-01T00:00:00Z'));
      vi.stubGlobal('fetch', mockFetch);

      const first = await generateInstallationToken(55);
      const second = await generateInstallationToken(55);

      expect(second).toEqual({ token: 'ghs_cached', expires_at: '2099-01-01T00:00:00Z' });
      expect(first).toEqual(second);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not share cache across different installation IDs', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(makeOkResponse('ghs_inst1', '2099-01-01T00:00:00Z'))
        .mockResolvedValueOnce(makeOkResponse('ghs_inst2', '2099-01-02T00:00:00Z'));
      vi.stubGlobal('fetch', mockFetch);

      const r1 = await generateInstallationToken(1);
      const r2 = await generateInstallationToken(2);

      expect(r1.token).toBe('ghs_inst1');
      expect(r2.token).toBe('ghs_inst2');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('calls GitHub API again once the 55-minute TTL expires', async () => {
      vi.useFakeTimers();
      const mockFetch = vi.fn().mockResolvedValue(makeOkResponse('ghs_refreshed'));
      vi.stubGlobal('fetch', mockFetch);

      await generateInstallationToken(66);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(56 * 60 * 1000);

      await generateInstallationToken(66);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('still serves cached token before TTL expires', async () => {
      vi.useFakeTimers();
      const mockFetch = vi.fn().mockResolvedValue(makeOkResponse('ghs_still_valid'));
      vi.stubGlobal('fetch', mockFetch);

      await generateInstallationToken(77);

      vi.advanceTimersByTime(54 * 60 * 1000);

      await generateInstallationToken(77);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
