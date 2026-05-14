import { GATEWAY_URL, INNGEST_URL, POSTGREST_URL, SUPABASE_ANON_KEY } from './constants';

export type CheckStatus = 'idle' | 'checking' | 'ok' | 'error';

export interface CheckResult {
  status: CheckStatus;
  responseTimeMs?: number;
  error?: string;
}

export interface ServiceConfig {
  id: string;
  name: string;
  note?: string;
  check: () => Promise<CheckResult>;
}

export async function pingUrl(url: string, headers?: Record<string, string>): Promise<CheckResult> {
  const start = performance.now();
  try {
    const res = await fetch(url, { headers });
    const elapsed = Math.round(performance.now() - start);
    if (res.ok || res.status === 206) {
      return { status: 'ok', responseTimeMs: elapsed };
    }
    return { status: 'error', responseTimeMs: elapsed, error: `HTTP ${res.status}` };
  } catch (err) {
    const elapsed = Math.round(performance.now() - start);
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'error', responseTimeMs: elapsed, error: msg };
  }
}

export const SERVICES: ServiceConfig[] = [
  {
    id: 'gateway',
    name: 'Gateway (:7700)',
    check: () => pingUrl(`${GATEWAY_URL}/health`),
  },
  {
    id: 'inngest',
    name: 'Inngest (:8288)',
    check: () => pingUrl(`${INNGEST_URL}/health`),
  },
  {
    id: 'postgrest',
    name: 'PostgREST (:54331)',
    check: () =>
      pingUrl(`${POSTGREST_URL}/tasks?limit=1`, {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      }),
  },
  {
    id: 'docker',
    name: 'Docker (worker image)',
    note: 'Inferred from gateway health',
    check: () => pingUrl(`${GATEWAY_URL}/health`),
  },
];
