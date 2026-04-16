import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMachine, destroyMachine, getMachine } from '../../src/lib/fly-client.js';
import { RateLimitExceededError, ExternalApiError } from '../../src/lib/errors.js';

describe('fly-client', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Set up environment variable
    process.env.FLY_API_TOKEN = 'test-token-123';

    // Create mock fetch
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.FLY_API_TOKEN;
  });

  describe('createMachine', () => {
    it('should create a machine and return machine data', async () => {
      const mockResponse = {
        id: 'machine-123',
        state: 'started',
        name: 'worker-1',
        image_ref: { digest: 'sha256:abc123' },
      };

      mockFetch.mockResolvedValueOnce({
        status: 201,
        json: async () => mockResponse,
      });

      const result = await createMachine('my-app', {
        image: 'registry.fly.io/ai-employee-workers:latest',
        vm_size: 'performance-2x',
        env: { TASK_ID: 'task-1', REPO_URL: 'https://github.com/example/repo' },
      });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.machines.dev/v1/apps/my-app/machines');
      expect(options.method).toBe('POST');
      expect(options.headers.Authorization).toBe('Bearer test-token-123');
    });

    it('should pass env vars in request body', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 201,
        json: async () => ({ id: 'machine-123', state: 'started' }),
      });

      await createMachine('my-app', {
        image: 'registry.fly.io/ai-employee-workers:latest',
        env: { TASK_ID: 'task-1', REPO_BRANCH: 'main' },
      });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.config.env).toEqual({ TASK_ID: 'task-1', REPO_BRANCH: 'main' });
    });

    it('should retry on 429 rate limit', async () => {
      mockFetch
        .mockResolvedValueOnce({
          status: 429,
          json: async () => ({}),
        })
        .mockResolvedValueOnce({
          status: 201,
          json: async () => ({ id: 'machine-123', state: 'started' }),
        });

      const result = await createMachine('my-app', {
        image: 'registry.fly.io/ai-employee-workers:latest',
      });

      expect(result.id).toBe('machine-123');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw ExternalApiError on non-2xx response', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 500,
        json: async () => ({ error: 'Internal server error' }),
      });

      await expect(
        createMachine('my-app', {
          image: 'registry.fly.io/ai-employee-workers:latest',
        }),
      ).rejects.toThrow(ExternalApiError);
    });
  });

  describe('destroyMachine', () => {
    it('should destroy a machine on 204 response', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 204,
      });

      await expect(destroyMachine('my-app', 'machine-123')).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.machines.dev/v1/apps/my-app/machines/machine-123?force=true');
      expect(options.method).toBe('DELETE');
    });

    it('should treat 404 as success (machine already gone)', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 404,
        json: async () => ({ error: 'Not found' }),
      });

      await expect(destroyMachine('my-app', 'machine-123')).resolves.toBeUndefined();
    });

    it('should treat 200 as success (Fly.io real-world DELETE behavior)', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ ok: true }),
      });

      await expect(destroyMachine('my-app', 'machine-123')).resolves.toBeUndefined();
    });

    it('should still treat 204 as success (backward compat)', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 204,
      });

      await expect(destroyMachine('my-app', 'machine-123')).resolves.toBeUndefined();
    });

    it('should retry on 429 rate limit', async () => {
      mockFetch
        .mockResolvedValueOnce({
          status: 429,
          json: async () => ({}),
        })
        .mockResolvedValueOnce({
          status: 204,
        });

      await destroyMachine('my-app', 'machine-123');

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw ExternalApiError on 5xx responses', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 500,
        json: async () => ({ error: 'Internal server error' }),
      });

      await expect(destroyMachine('my-app', 'machine-123')).rejects.toThrow(ExternalApiError);
    });
  });

  describe('getMachine', () => {
    it('should return machine data on 200 response', async () => {
      const mockResponse = {
        id: 'machine-123',
        state: 'started',
        name: 'worker-1',
      };

      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockResponse,
      });

      const result = await getMachine('my-app', 'machine-123');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.machines.dev/v1/apps/my-app/machines/machine-123');
      expect(options.method).toBe('GET');
    });

    it('should return null on 404 response', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 404,
        json: async () => ({ error: 'Not found' }),
      });

      const result = await getMachine('my-app', 'machine-123');

      expect(result).toBeNull();
    });

    it('should retry on 429 rate limit', async () => {
      mockFetch
        .mockResolvedValueOnce({
          status: 429,
          json: async () => ({}),
        })
        .mockResolvedValueOnce({
          status: 200,
          json: async () => ({ id: 'machine-123', state: 'started' }),
        });

      const result = await getMachine('my-app', 'machine-123');

      expect(result?.id).toBe('machine-123');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw ExternalApiError on non-2xx, non-404 response', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 500,
        json: async () => ({ error: 'Internal server error' }),
      });

      await expect(getMachine('my-app', 'machine-123')).rejects.toThrow(ExternalApiError);
    });
  });

  describe('error handling', () => {
    it('should throw when FLY_API_TOKEN is not set', async () => {
      delete process.env.FLY_API_TOKEN;

      await expect(
        createMachine('my-app', {
          image: 'registry.fly.io/ai-employee-workers:latest',
        }),
      ).rejects.toThrow('FLY_API_TOKEN environment variable is not set');
    });

    it('should throw RateLimitExceededError after exhausting retries on 429', async () => {
      mockFetch.mockResolvedValue({
        status: 429,
        json: async () => ({}),
      });

      await expect(
        createMachine('my-app', {
          image: 'registry.fly.io/ai-employee-workers:latest',
        }),
      ).rejects.toThrow(RateLimitExceededError);

      // Should have tried 3 times (maxAttempts: 3)
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });
});
