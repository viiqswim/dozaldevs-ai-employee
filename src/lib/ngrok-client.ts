/**
 * ngrok agent API client.
 * Queries the ngrok agent's tunnels endpoint to retrieve the public HTTPS tunnel URL.
 * Used to expose local services (e.g., Supabase PostgREST) to the internet for worker containers.
 *
 * Expected API response shape:
 * {
 *   tunnels: [
 *     { public_url: "https://...", proto: "https", config?: {...} },
 *     { public_url: "http://...", proto: "http", config?: {...} }
 *   ]
 * }
 *
 * Throws:
 * - Error if ngrok agent is unreachable (ECONNREFUSED, timeout, etc.)
 * - Error if no tunnels are running
 * - Error if response JSON is invalid
 */

/**
 * Query the ngrok agent API and return the first HTTPS tunnel URL.
 * If the TUNNEL_URL environment variable is set, it is returned directly without querying the agent API.
 * @param agentUrl - ngrok agent base URL (default: "http://localhost:4040")
 * @returns The public HTTPS tunnel URL
 * @throws Error if agent is unreachable, no tunnels exist, or JSON parsing fails
 */
export async function getNgrokTunnelUrl(
  agentUrl: string = 'http://localhost:4040',
): Promise<string> {
  // Allow TUNNEL_URL env var to bypass ngrok agent API (e.g., for Cloudflare Tunnel)
  const tunnelUrlOverride = process.env.TUNNEL_URL;
  if (tunnelUrlOverride && tunnelUrlOverride.trim().length > 0) {
    return tunnelUrlOverride.trim();
  }

  const url = `${agentUrl}/api/tunnels`;

  let response: Response;
  try {
    const raw = await fetch(url);
    // Guard against malformed fetch responses (e.g., missing .json method)
    if (!raw || typeof raw.json !== 'function') {
      throw new Error('no response');
    }
    response = raw;
  } catch (error) {
    throw new Error(
      `ngrok agent not reachable at ${agentUrl}. Verify ngrok is installed and running. start with: ngrok http 54321`,
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error(
      `Failed to parse ngrok agent response as JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Validate response shape
  if (!data || typeof data !== 'object' || !('tunnels' in data)) {
    throw new Error('Invalid ngrok agent response: missing "tunnels" field');
  }

  const tunnels = (data as Record<string, unknown>).tunnels;
  if (!Array.isArray(tunnels)) {
    throw new Error('Invalid ngrok agent response: "tunnels" is not an array');
  }

  if (tunnels.length === 0) {
    throw new Error('ngrok is not running any tunnels. Start with: ngrok http 54321');
  }

  // Find first HTTPS tunnel
  const httpsTunnel = tunnels.find(
    (tunnel) =>
      tunnel &&
      typeof tunnel === 'object' &&
      'proto' in tunnel &&
      tunnel.proto === 'https' &&
      'public_url' in tunnel &&
      typeof tunnel.public_url === 'string',
  );

  if (!httpsTunnel || typeof httpsTunnel !== 'object' || !('public_url' in httpsTunnel)) {
    throw new Error('No HTTPS tunnel found in ngrok agent response');
  }

  return (httpsTunnel as Record<string, unknown>).public_url as string;
}
