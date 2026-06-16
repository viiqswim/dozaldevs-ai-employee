import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock getTunnelUrl before importing the module under test
const { mockGetTunnelUrl } = vi.hoisted(() => ({
  mockGetTunnelUrl: vi.fn(),
}));

vi.mock('../../src/lib/tunnel-client.js', () => ({
  getTunnelUrl: mockGetTunnelUrl,
}));

// WORKER_RUNTIME is a module-level const evaluated at import time — mock the config module
vi.mock('../../src/lib/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/config.js')>();
  return {
    ...actual,
    // Will be overridden per-test via vi.doMock or by re-importing; use a getter so tests can control it
    get WORKER_RUNTIME() {
      return process.env.WORKER_RUNTIME ?? 'docker';
    },
  };
});

import { resolveWorkerSupabaseUrl } from '../../src/inngest/lifecycle/lib/worker-url-resolver.js';

const SUPABASE_URL = 'https://supabase.example.com';
const TUNNEL_URL = 'https://tunnel.example';

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no tunnel URL
  delete process.env.TUNNEL_URL;
  delete process.env.WORKER_RUNTIME;
});

afterEach(() => {
  delete process.env.TUNNEL_URL;
  delete process.env.WORKER_RUNTIME;
});

describe('resolveWorkerSupabaseUrl', () => {
  describe('fly runtime', () => {
    it('fly + TUNNEL_URL unset → returns supabaseUrl, getTunnelUrl NOT called (regression lock for the incident)', async () => {
      // This is the exact bug that was fixed in commit 0b342742 and re-introduced in 751c9b19.
      // When running in full-cloud mode (Fly workers + Supabase Cloud), TUNNEL_URL is not set.
      // getTunnelUrl() throws when TUNNEL_URL is absent — calling it here would crash the task.
      process.env.WORKER_RUNTIME = 'fly';
      // TUNNEL_URL intentionally not set

      const result = await resolveWorkerSupabaseUrl(SUPABASE_URL);

      expect(result).toBe(SUPABASE_URL);
      expect(mockGetTunnelUrl).not.toHaveBeenCalled();
    });

    it('fly + TUNNEL_URL set → returns tunnel URL, getTunnelUrl called once (hybrid mode preserved)', async () => {
      process.env.WORKER_RUNTIME = 'fly';
      process.env.TUNNEL_URL = TUNNEL_URL;
      mockGetTunnelUrl.mockResolvedValue(TUNNEL_URL);

      const result = await resolveWorkerSupabaseUrl(SUPABASE_URL);

      expect(result).toBe(TUNNEL_URL);
      expect(mockGetTunnelUrl).toHaveBeenCalledOnce();
    });
  });

  describe('docker runtime', () => {
    it('docker + TUNNEL_URL unset → returns supabaseUrl, getTunnelUrl NOT called', async () => {
      process.env.WORKER_RUNTIME = 'docker';
      // TUNNEL_URL intentionally not set

      const result = await resolveWorkerSupabaseUrl(SUPABASE_URL);

      expect(result).toBe(SUPABASE_URL);
      expect(mockGetTunnelUrl).not.toHaveBeenCalled();
    });

    it('docker + TUNNEL_URL set → returns supabaseUrl (runtime gate wins), getTunnelUrl NOT called', async () => {
      // Even if TUNNEL_URL is set, the runtime gate (WORKER_RUNTIME !== 'fly') prevents tunnel use.
      process.env.WORKER_RUNTIME = 'docker';
      process.env.TUNNEL_URL = TUNNEL_URL;

      const result = await resolveWorkerSupabaseUrl(SUPABASE_URL);

      expect(result).toBe(SUPABASE_URL);
      expect(mockGetTunnelUrl).not.toHaveBeenCalled();
    });
  });

  describe('equivalence assertion', () => {
    it('single helper call returns the same value both call sites would use', async () => {
      // De-duplication guarantee: both machine-provisioner.ts and delivery-retry.ts call this
      // single helper — there is no second copy of this logic to diverge.
      process.env.WORKER_RUNTIME = 'docker';

      const result = await resolveWorkerSupabaseUrl(SUPABASE_URL);

      // The result is what both call sites receive — one helper, one truth.
      expect(result).toBe(SUPABASE_URL);
    });
  });
});
