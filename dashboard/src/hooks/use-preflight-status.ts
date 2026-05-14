import { useCallback, useEffect, useState } from 'react';
import { SERVICES, type CheckResult, type CheckStatus } from '@/lib/preflight-services';

const AUTO_POLL_MS = 60_000;

export interface PreflightStatus {
  results: Record<string, CheckResult>;
  allOk: boolean;
  hasError: boolean;
  failingNames: string[];
  checking: boolean;
  lastCheckedAt: number | null;
  runChecks: () => void;
}

export function usePreflightStatus(): PreflightStatus {
  const [results, setResults] = useState<Record<string, CheckResult>>(() =>
    Object.fromEntries(SERVICES.map((s) => [s.id, { status: 'idle' as CheckStatus }])),
  );
  const [checking, setChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);

  const runChecks = useCallback(async () => {
    setChecking(true);
    setResults(
      Object.fromEntries(SERVICES.map((s) => [s.id, { status: 'checking' as CheckStatus }])),
    );

    const settled = await Promise.allSettled(SERVICES.map((s) => s.check()));
    const next: Record<string, CheckResult> = {};
    SERVICES.forEach((s, i) => {
      const outcome = settled[i];
      next[s.id] =
        outcome.status === 'fulfilled'
          ? outcome.value
          : {
              status: 'error',
              error:
                outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
            };
    });

    setResults(next);
    setLastCheckedAt(Date.now());
    setChecking(false);
  }, []);

  useEffect(() => {
    void runChecks();
  }, [runChecks]);

  useEffect(() => {
    const id = setInterval(() => void runChecks(), AUTO_POLL_MS);
    return () => clearInterval(id);
  }, [runChecks]);

  const checked = Object.values(results).every((r) => r.status === 'ok' || r.status === 'error');
  const hasError = Object.values(results).some((r) => r.status === 'error');
  const allOk = checked && !hasError;
  const failingNames = SERVICES.filter((s) => results[s.id]?.status === 'error').map((s) => s.name);

  return {
    results,
    allOk,
    hasError,
    failingNames,
    checking,
    lastCheckedAt,
    runChecks: () => {
      void runChecks();
    },
  };
}
