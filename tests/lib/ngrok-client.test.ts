import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getNgrokTunnelUrl } from '../../src/lib/ngrok-client.js';

describe('ngrok-client', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeTunnelsResponse(
    tunnels: Array<{ public_url: string; proto: string; config?: Record<string, unknown> }>,
  ) {
    return {
      status: 200,
      json: async () => ({ tunnels }),
    };
  }

  it('should return https URL when single tunnel is available', async () => {
    mockFetch.mockResolvedValueOnce(
      makeTunnelsResponse([
        {
          public_url: 'https://abc123.ngrok-free.app',
          proto: 'https',
          config: { addr: 'http://localhost:54321' },
        },
      ]),
    );

    const result = await getNgrokTunnelUrl();

    expect(result).toBe('https://abc123.ngrok-free.app');
  });

  it('should pick https tunnel over http when multiple tunnels exist', async () => {
    mockFetch.mockResolvedValueOnce(
      makeTunnelsResponse([
        {
          public_url: 'http://abc123.ngrok-free.app',
          proto: 'http',
          config: {},
        },
        {
          public_url: 'https://abc123.ngrok-free.app',
          proto: 'https',
          config: {},
        },
      ]),
    );

    const result = await getNgrokTunnelUrl();

    expect(result).toBe('https://abc123.ngrok-free.app');
  });

  it('should throw descriptive error when no tunnels are available', async () => {
    mockFetch.mockResolvedValueOnce(makeTunnelsResponse([]));

    await expect(getNgrokTunnelUrl()).rejects.toThrow(/ngrok is not running/);
    await expect(getNgrokTunnelUrl()).rejects.toThrow(/start with: ngrok http 54321/);
  });

  it('should throw descriptive error when ngrok agent is unreachable', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(getNgrokTunnelUrl()).rejects.toThrow(/ngrok agent not reachable/);
    await expect(getNgrokTunnelUrl()).rejects.toThrow(/ngrok is installed and running/);
  });

  it('should throw error when response JSON is invalid', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    });

    await expect(getNgrokTunnelUrl()).rejects.toThrow();
  });

  it('should use custom agentUrl parameter in fetch URL', async () => {
    mockFetch.mockResolvedValueOnce(
      makeTunnelsResponse([
        {
          public_url: 'https://abc123.ngrok-free.app',
          proto: 'https',
          config: {},
        },
      ]),
    );

    await getNgrokTunnelUrl('http://custom:9999');

    expect(mockFetch).toHaveBeenCalledWith('http://custom:9999/api/tunnels');
  });

  it('should use default agentUrl http://localhost:4040 when no parameter provided', async () => {
    mockFetch.mockResolvedValueOnce(
      makeTunnelsResponse([
        {
          public_url: 'https://abc123.ngrok-free.app',
          proto: 'https',
          config: {},
        },
      ]),
    );

    await getNgrokTunnelUrl();

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:4040/api/tunnels');
  });
});
