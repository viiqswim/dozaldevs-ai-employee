/**
 * Normalize a GitHub repository URL by trimming whitespace and removing .git suffix.
 *
 * @param url - The repository URL to normalize
 * @returns Normalized URL without trailing .git and whitespace
 */
export function normalizeRepoUrl(url: string): string {
  return url.trim().replace(/\.git$/, '');
}

/**
 * Parse GitHub repository URL to extract owner and repo name.
 * Handles HTTPS URLs with optional .git suffix.
 *
 * @param repoUrl - GitHub repository URL (e.g., https://github.com/owner/repo or https://github.com/owner/repo.git)
 * @returns Object with owner and repo properties
 * @throws Error if URL format is not recognized
 */
export function parseRepoOwnerAndName(repoUrl: string): { owner: string; repo: string } {
  // Normalize the URL first
  const normalized = normalizeRepoUrl(repoUrl);

  // Match HTTPS GitHub URLs: https://github.com/owner/repo
  const httpsMatch = normalized.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/);

  if (httpsMatch) {
    const owner = httpsMatch[1];
    const repo = httpsMatch[2];
    return { owner, repo };
  }

  // Unrecognized format
  throw new Error(`Unrecognized repository URL format: ${repoUrl}`);
}
