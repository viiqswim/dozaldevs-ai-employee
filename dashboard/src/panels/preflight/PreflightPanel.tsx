import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GATEWAY_URL, INNGEST_URL, POSTGREST_URL, SUPABASE_ANON_KEY } from '@/lib/constants';

type CheckStatus = 'idle' | 'checking' | 'ok' | 'error';

interface CheckResult {
  status: CheckStatus;
  responseTimeMs?: number;
  error?: string;
}

interface ServiceConfig {
  id: string;
  name: string;
  note?: string;
  check: () => Promise<CheckResult>;
}

async function pingUrl(url: string, headers?: Record<string, string>): Promise<CheckResult> {
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

const SERVICES: ServiceConfig[] = [
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

function StatusBadge({ result }: { result: CheckResult }) {
  if (result.status === 'idle' || result.status === 'checking') {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
        {result.status === 'checking' ? 'Checking...' : 'Idle'}
      </span>
    );
  }
  if (result.status === 'ok') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
        ✓ Online
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
      ✗ Offline
    </span>
  );
}

function ServiceCard({ service, result }: { service: ServiceConfig; result: CheckResult }) {
  return (
    <Card className="flex flex-col gap-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{service.name}</CardTitle>
        {service.note && <p className="text-xs text-muted-foreground">{service.note}</p>}
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="flex items-center gap-2">
          <StatusBadge result={result} />
          {result.status === 'ok' && result.responseTimeMs !== undefined && (
            <span className="text-xs text-muted-foreground">{result.responseTimeMs} ms</span>
          )}
        </div>
        {result.status === 'error' && result.error && (
          <p className="mt-1 text-xs text-red-600">{result.error}</p>
        )}
      </CardContent>
    </Card>
  );
}

function formatAgo(ts: number | null): string {
  if (ts === null) return 'Never';
  const secs = Math.round((Date.now() - ts) / 1000);
  if (secs < 5) return 'Just now';
  if (secs < 60) return `${secs}s ago`;
  return `${Math.round(secs / 60)}m ago`;
}

export function PreflightPanel() {
  const [results, setResults] = useState<Record<string, CheckResult>>(() =>
    Object.fromEntries(SERVICES.map((s) => [s.id, { status: 'idle' as CheckStatus }])),
  );
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const runChecks = useCallback(async () => {
    setIsChecking(true);
    setResults(
      Object.fromEntries(SERVICES.map((s) => [s.id, { status: 'checking' as CheckStatus }])),
    );

    const settled = await Promise.allSettled(SERVICES.map((s) => s.check()));

    const next: Record<string, CheckResult> = {};
    SERVICES.forEach((s, i) => {
      const outcome = settled[i];
      if (outcome.status === 'fulfilled') {
        next[s.id] = outcome.value;
      } else {
        next[s.id] = {
          status: 'error',
          error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
        };
      }
    });

    setResults(next);
    setLastCheckedAt(Date.now());
    setIsChecking(false);
  }, []);

  useEffect(() => {
    void runChecks();
  }, [runChecks]);

  void now;

  return (
    <div className="p-6">
      <div className="max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Preflight Check</h2>
            <p className="text-sm text-muted-foreground">
              Last checked: <span className="font-medium">{formatAgo(lastCheckedAt)}</span>
            </p>
          </div>
          <Button onClick={() => void runChecks()} disabled={isChecking} size="sm">
            {isChecking ? 'Checking...' : 'Refresh All'}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {SERVICES.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              result={results[service.id] ?? { status: 'idle' }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
