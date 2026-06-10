import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchGitHubRepos, gatewayFetch } from '@/lib/gateway';
import type { GitHubRepo, TenantIntegration } from '@/lib/types';

interface UseWizardDataResult {
  repoUrl: string;
  setRepoUrl: (url: string) => void;
  repos: GitHubRepo[];
  reposLoading: boolean;
  reposError: string | null;
  githubConnected: boolean | null;
}

export function useWizardData(tenantId: string): UseWizardDataResult {
  const [searchParams, setSearchParams] = useSearchParams();

  const [repoUrl, setRepoUrl] = useState<string>(() => {
    const encoded = searchParams.get('repo');
    return encoded ? decodeURIComponent(encoded) : '';
  });
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState<string | null>(null);
  const [githubConnected, setGithubConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    gatewayFetch<TenantIntegration[]>(`/admin/tenants/${tenantId}/integrations?provider=github`)
      .then((rows) => {
        if (cancelled) return;
        setGithubConnected(rows.length > 0);
      })
      .catch(() => {
        if (cancelled) return;
        setGithubConnected(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    if (!githubConnected) return;
    let cancelled = false;
    setReposLoading(true);
    setReposError(null);
    fetchGitHubRepos(tenantId)
      .then((data) => {
        if (cancelled) return;
        setRepos(data.repos ?? []);
        setReposLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRepos([]);
        setReposError(err instanceof Error ? err.message : 'Failed to load repositories');
        setReposLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, githubConnected]);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (repoUrl) {
          next.set('repo', encodeURIComponent(repoUrl));
        } else {
          next.delete('repo');
        }
        return next;
      },
      { replace: true },
    );
  }, [repoUrl, setSearchParams]);

  return {
    repoUrl,
    setRepoUrl,
    repos,
    reposLoading,
    reposError,
    githubConnected,
  };
}
