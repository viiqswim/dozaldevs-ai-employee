/**
 * Tunnel URL resolver for hybrid mode (local Supabase + Fly.io workers).
 * Returns the public HTTPS URL from the TUNNEL_URL environment variable.
 *
 * To generate a tunnel URL, run:
 *   cloudflared tunnel --url http://localhost:54321
 *
 * Note: ngrok free tier is not supported — Fly.io egress IPs are blocked by ngrok's
 * free infrastructure. See AGENTS.md §6 for details. Use Cloudflare Tunnel (free).
 */

/**
 * Return the public tunnel URL for hybrid mode.
 * Reads TUNNEL_URL from the environment. Throws with setup guidance if not set.
 * @returns The public HTTPS tunnel URL
 * @throws Error if TUNNEL_URL is not set or is empty
 */
export async function getTunnelUrl(): Promise<string> {
  const tunnelUrl = process.env.TUNNEL_URL?.trim();
  if (tunnelUrl && tunnelUrl.length > 0) {
    return tunnelUrl;
  }
  throw new Error(
    'TUNNEL_URL is not set. Start a Cloudflare Tunnel and set TUNNEL_URL to the printed URL. ' +
      'Run: cloudflared tunnel --url http://localhost:54321',
  );
}
