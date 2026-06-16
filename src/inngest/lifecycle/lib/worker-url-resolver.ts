import { getTunnelUrl } from '../../../lib/tunnel-client.js';
import { WORKER_RUNTIME } from '../../../lib/config.js';

/**
 * Resolves the effective Supabase URL for a worker machine.
 *
 * Hybrid mode (local Supabase + Fly workers) needs the tunnel URL so the
 * Fly machine can reach the local Supabase instance.
 *
 * Full-cloud mode (Supabase Cloud + Fly workers) must NOT call getTunnelUrl()
 * because it throws when TUNNEL_URL is unset — this was Bug 1 (fixed Jun 1,
 * commit 0b342742) in the execution path, and re-introduced in the delivery
 * path by the Jun 7 refactor (commit 751c9b19). This shared helper is the
 * single source of truth so both paths stay in sync.
 */
export async function resolveWorkerSupabaseUrl(supabaseUrl: string): Promise<string> {
  return WORKER_RUNTIME === 'fly' && process.env.TUNNEL_URL ? await getTunnelUrl() : supabaseUrl;
}
