import { describe, it, expect, afterEach } from 'vitest';
import { getTunnelUrl } from '../../src/lib/tunnel-client.js';

describe('getTunnelUrl', () => {
  afterEach(() => {
    delete process.env.TUNNEL_URL;
  });

  it('returns TUNNEL_URL when set', async () => {
    process.env.TUNNEL_URL = 'https://abc123.trycloudflare.com';
    await expect(getTunnelUrl()).resolves.toBe('https://abc123.trycloudflare.com');
  });

  it('trims whitespace from TUNNEL_URL', async () => {
    process.env.TUNNEL_URL = '  https://abc123.trycloudflare.com  ';
    await expect(getTunnelUrl()).resolves.toBe('https://abc123.trycloudflare.com');
  });

  it('throws with cloudflared guidance when TUNNEL_URL is not set', async () => {
    delete process.env.TUNNEL_URL;
    await expect(getTunnelUrl()).rejects.toThrow(/TUNNEL_URL is not set/);
    await expect(getTunnelUrl()).rejects.toThrow(/cloudflared/);
  });

  it('throws when TUNNEL_URL is an empty string', async () => {
    process.env.TUNNEL_URL = '';
    await expect(getTunnelUrl()).rejects.toThrow(/TUNNEL_URL is not set/);
  });
});
