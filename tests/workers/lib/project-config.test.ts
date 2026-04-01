import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchProjectConfig,
  parseRepoOwnerAndName,
  type ProjectConfig,
} from '../../../src/workers/lib/project-config.js';
import type { PostgRESTClient } from '../../../src/workers/lib/postgrest-client.js';

const mockLogger = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  createLogger: () => mockLogger,
  taskLogger: () => mockLogger,
}));

describe('project-config', () => {
  let mockPostgrestClient: PostgRESTClient;

  beforeEach(() => {
    mockPostgrestClient = {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchProjectConfig', () => {
    it('returns ProjectConfig when project is found', async () => {
      const mockConfig: ProjectConfig = {
        id: 'proj-123',
        name: 'Test Project',
        repo_url: 'https://github.com/test/repo',
        default_branch: 'main',
        tooling_config: {
          typescript: 'pnpm tsc --noEmit',
          lint: 'pnpm lint',
        },
      };

      vi.mocked(mockPostgrestClient.get).mockResolvedValue([mockConfig]);

      const result = await fetchProjectConfig('proj-123', mockPostgrestClient);

      expect(result).toEqual(mockConfig);
      expect(mockPostgrestClient.get).toHaveBeenCalledWith(
        'projects',
        'id=eq.proj-123&select=id,name,repo_url,default_branch,tooling_config',
      );
    });

    it('returns null when result array is empty', async () => {
      vi.mocked(mockPostgrestClient.get).mockResolvedValue([]);

      const result = await fetchProjectConfig('proj-nonexistent', mockPostgrestClient);

      expect(result).toBeNull();
    });

    it('returns null when PostgREST returns null', async () => {
      vi.mocked(mockPostgrestClient.get).mockResolvedValue(null);

      const result = await fetchProjectConfig('proj-123', mockPostgrestClient);

      expect(result).toBeNull();
    });

    it('returns null and logs warning when PostgREST throws error', async () => {
      const testError = new Error('Network error');
      vi.mocked(mockPostgrestClient.get).mockRejectedValue(testError);

      const result = await fetchProjectConfig('proj-123', mockPostgrestClient);

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[project-config] Failed to fetch project proj-123: Network error'),
      );
    });

    it('returns null and logs warning when PostgREST throws non-Error object', async () => {
      vi.mocked(mockPostgrestClient.get).mockRejectedValue('Unknown error');

      const result = await fetchProjectConfig('proj-123', mockPostgrestClient);

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[project-config] Failed to fetch project proj-123: Unknown error'),
      );
    });

    it('returns first element when multiple projects are returned', async () => {
      const firstConfig: ProjectConfig = {
        id: 'proj-123',
        name: 'First Project',
        repo_url: 'https://github.com/test/repo1',
        default_branch: 'main',
        tooling_config: null,
      };

      const secondConfig: ProjectConfig = {
        id: 'proj-456',
        name: 'Second Project',
        repo_url: 'https://github.com/test/repo2',
        default_branch: 'develop',
        tooling_config: null,
      };

      vi.mocked(mockPostgrestClient.get).mockResolvedValue([firstConfig, secondConfig]);

      const result = await fetchProjectConfig('proj-123', mockPostgrestClient);

      expect(result).toEqual(firstConfig);
    });

    it('handles tooling_config as null', async () => {
      const mockConfig: ProjectConfig = {
        id: 'proj-123',
        name: 'Test Project',
        repo_url: 'https://github.com/test/repo',
        default_branch: 'main',
        tooling_config: null,
      };

      vi.mocked(mockPostgrestClient.get).mockResolvedValue([mockConfig]);

      const result = await fetchProjectConfig('proj-123', mockPostgrestClient);

      expect(result?.tooling_config).toBeNull();
    });
  });

  describe('parseRepoOwnerAndName', () => {
    it('parses HTTPS GitHub URL without .git suffix', () => {
      const result = parseRepoOwnerAndName('https://github.com/facebook/react');

      expect(result).toEqual({ owner: 'facebook', repo: 'react' });
    });

    it('parses HTTPS GitHub URL with .git suffix', () => {
      const result = parseRepoOwnerAndName('https://github.com/microsoft/vscode.git');

      expect(result).toEqual({ owner: 'microsoft', repo: 'vscode' });
    });

    it('handles repository names with hyphens', () => {
      const result = parseRepoOwnerAndName('https://github.com/vercel/next-js');

      expect(result).toEqual({ owner: 'vercel', repo: 'next-js' });
    });

    it('handles repository names with dots', () => {
      const result = parseRepoOwnerAndName('https://github.com/lodash/lodash.js');

      expect(result).toEqual({ owner: 'lodash', repo: 'lodash.js' });
    });

    it('handles organization names with hyphens', () => {
      const result = parseRepoOwnerAndName('https://github.com/my-org/my-repo');

      expect(result).toEqual({ owner: 'my-org', repo: 'my-repo' });
    });

    it('throws error for SSH URL format', () => {
      expect(() => {
        parseRepoOwnerAndName('git@github.com:facebook/react.git');
      }).toThrow('Unrecognized repository URL format');
    });

    it('throws error for HTTP URL (non-HTTPS)', () => {
      expect(() => {
        parseRepoOwnerAndName('http://github.com/facebook/react');
      }).toThrow('Unrecognized repository URL format');
    });

    it('throws error for malformed URL', () => {
      expect(() => {
        parseRepoOwnerAndName('https://github.com/facebook');
      }).toThrow('Unrecognized repository URL format');
    });

    it('throws error for empty string', () => {
      expect(() => {
        parseRepoOwnerAndName('');
      }).toThrow('Unrecognized repository URL format');
    });

    it('throws error for non-GitHub URL', () => {
      expect(() => {
        parseRepoOwnerAndName('https://gitlab.com/facebook/react');
      }).toThrow('Unrecognized repository URL format');
    });
  });
});
