import { describe, it, expect } from 'vitest';
import {
  ToolingConfigSchema,
  CreateProjectSchema,
  UpdateProjectSchema,
  parseCreateProject,
  parseUpdateProject,
} from '../../src/gateway/validation/schemas.js';
import { ZodError } from 'zod';

describe('Admin Projects Validation Schemas', () => {
  describe('ToolingConfigSchema', () => {
    it('should accept valid tooling config with all optional fields', () => {
      const input = {
        install: 'pnpm install --frozen-lockfile',
        typescript: 'tsc',
        lint: 'eslint .',
        unit: 'vitest',
        integration: 'vitest --run integration',
        e2e: 'playwright test',
      };
      const result = ToolingConfigSchema.parse(input);
      expect(result).toEqual(input);
    });

    it('should accept empty object (all fields optional)', () => {
      const result = ToolingConfigSchema.parse({});
      expect(result).toEqual({});
    });

    it('should accept partial tooling config', () => {
      const input = {
        install: 'npm install',
        lint: 'eslint .',
      };
      const result = ToolingConfigSchema.parse(input);
      expect(result).toEqual(input);
    });

    it('should reject unknown keys in strict mode', () => {
      const input = {
        install: 'pnpm install',
        unknown_field: 'should fail',
      };
      expect(() => ToolingConfigSchema.parse(input)).toThrow(ZodError);
    });

    it('should accept only install field', () => {
      const input = { install: 'pnpm install --frozen-lockfile' };
      const result = ToolingConfigSchema.parse(input);
      expect(result).toEqual(input);
    });
  });

  describe('CreateProjectSchema', () => {
    it('should parse valid CreateProject payload with all required fields', () => {
      const input = {
        name: 'My Project',
        repo_url: 'https://github.com/owner/repo',
        jira_project_key: 'PROJ',
      };
      const result = parseCreateProject(input);
      expect(result.name).toBe('My Project');
      expect(result.repo_url).toBe('https://github.com/owner/repo');
      expect(result.jira_project_key).toBe('PROJ');
      expect(result.default_branch).toBe('main');
      expect(result.concurrency_limit).toBe(3);
    });

    it('should parse valid CreateProject with optional tooling_config', () => {
      const input = {
        name: 'My Project',
        repo_url: 'https://github.com/owner/repo',
        jira_project_key: 'PROJ',
        tooling_config: {
          install: 'pnpm install --frozen-lockfile',
          lint: 'eslint .',
        },
      };
      const result = parseCreateProject(input);
      expect(result.tooling_config).toEqual({
        install: 'pnpm install --frozen-lockfile',
        lint: 'eslint .',
      });
    });

    it('should reject missing repo_url', () => {
      const input = {
        name: 'My Project',
        jira_project_key: 'PROJ',
      };
      expect(() => parseCreateProject(input)).toThrow(ZodError);
    });

    it('should reject missing jira_project_key', () => {
      const input = {
        name: 'My Project',
        repo_url: 'https://github.com/owner/repo',
      };
      expect(() => parseCreateProject(input)).toThrow(ZodError);
    });

    it('should reject invalid URL format (not HTTPS GitHub)', () => {
      const input = {
        name: 'My Project',
        repo_url: 'https://gitlab.com/owner/repo',
        jira_project_key: 'PROJ',
      };
      expect(() => parseCreateProject(input)).toThrow(ZodError);
    });

    it('should reject SSH URL format', () => {
      const input = {
        name: 'My Project',
        repo_url: 'git@github.com:owner/repo.git',
        jira_project_key: 'PROJ',
      };
      expect(() => parseCreateProject(input)).toThrow(ZodError);
    });

    it('should reject unknown tooling_config keys', () => {
      const input = {
        name: 'My Project',
        repo_url: 'https://github.com/owner/repo',
        jira_project_key: 'PROJ',
        tooling_config: {
          install: 'pnpm install',
          unknown_key: 'should fail',
        },
      };
      expect(() => parseCreateProject(input)).toThrow(ZodError);
    });

    it('should accept custom default_branch', () => {
      const input = {
        name: 'My Project',
        repo_url: 'https://github.com/owner/repo',
        jira_project_key: 'PROJ',
        default_branch: 'develop',
      };
      const result = parseCreateProject(input);
      expect(result.default_branch).toBe('develop');
    });

    it('should accept custom concurrency_limit', () => {
      const input = {
        name: 'My Project',
        repo_url: 'https://github.com/owner/repo',
        jira_project_key: 'PROJ',
        concurrency_limit: 5,
      };
      const result = parseCreateProject(input);
      expect(result.concurrency_limit).toBe(5);
    });
  });

  describe('UpdateProjectSchema', () => {
    it('should parse valid UpdateProject with only name field', () => {
      const input = {
        name: 'Updated Name',
      };
      const result = parseUpdateProject(input);
      expect(result.name).toBe('Updated Name');
    });

    it('should parse valid UpdateProject with repo_url', () => {
      const input = {
        repo_url: 'https://github.com/newowner/newrepo',
      };
      const result = parseUpdateProject(input);
      expect(result.repo_url).toBe('https://github.com/newowner/newrepo');
    });

    it('should parse UpdateProject with multiple fields', () => {
      const input = {
        name: 'Updated Name',
        default_branch: 'staging',
        concurrency_limit: 2,
      };
      const result = parseUpdateProject(input);
      expect(result.name).toBe('Updated Name');
      expect(result.default_branch).toBe('staging');
      expect(result.concurrency_limit).toBe(2);
    });

    it('should reject empty UpdateProject body', () => {
      const input = {};
      expect(() => parseUpdateProject(input)).toThrow(ZodError);
    });

    it('should reject invalid repo_url in update', () => {
      const input = {
        repo_url: 'git@github.com:owner/repo.git',
      };
      expect(() => parseUpdateProject(input)).toThrow(ZodError);
    });

    it('should accept partial tooling_config update', () => {
      const input = {
        tooling_config: {
          lint: 'eslint .',
        },
      };
      const result = parseUpdateProject(input);
      expect(result.tooling_config).toEqual({ lint: 'eslint .' });
    });
  });
});
