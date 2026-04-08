import { describe, it, expect } from 'vitest';
import {
  resolveToolingConfig,
  DEFAULT_TOOLING_CONFIG,
} from '../../src/workers/lib/task-context.js';
import type { ProjectRow } from '../../src/workers/lib/task-context.js';

describe('ToolingConfig install field', () => {
  it('DEFAULT_TOOLING_CONFIG has install field with pnpm frozen-lockfile', () => {
    expect(DEFAULT_TOOLING_CONFIG.install).toBe('pnpm install --frozen-lockfile');
  });

  it('resolveToolingConfig with null projectRow returns defaults including install', () => {
    const result = resolveToolingConfig(null);
    expect(result.install).toBe('pnpm install --frozen-lockfile');
    expect(result.typescript).toBe('pnpm tsc --noEmit');
    expect(result.lint).toBe('pnpm lint');
    expect(result.unit).toBe('pnpm test -- --run');
  });

  it('resolveToolingConfig with empty tooling_config returns defaults including install', () => {
    const projectRow: ProjectRow = {
      id: 'proj-1',
      tooling_config: {},
      name: 'test-project',
      repo_url: 'https://github.com/test/repo',
      default_branch: 'main',
    };
    const result = resolveToolingConfig(projectRow);
    expect(result.install).toBe('pnpm install --frozen-lockfile');
    expect(result.typescript).toBe('pnpm tsc --noEmit');
    expect(result.lint).toBe('pnpm lint');
    expect(result.unit).toBe('pnpm test -- --run');
  });

  it('resolveToolingConfig with custom install command overrides default', () => {
    const projectRow: ProjectRow = {
      id: 'proj-2',
      tooling_config: {
        install: 'npm ci',
      },
      name: 'npm-project',
      repo_url: 'https://github.com/test/npm-repo',
      default_branch: 'main',
    };
    const result = resolveToolingConfig(projectRow);
    expect(result.install).toBe('npm ci');
    // Other defaults should still be present
    expect(result.typescript).toBe('pnpm tsc --noEmit');
    expect(result.lint).toBe('pnpm lint');
    expect(result.unit).toBe('pnpm test -- --run');
  });

  it('resolveToolingConfig with bun install command overrides default', () => {
    const projectRow: ProjectRow = {
      id: 'proj-3',
      tooling_config: {
        install: 'bun install --frozen-lockfile',
      },
      name: 'bun-project',
      repo_url: 'https://github.com/test/bun-repo',
      default_branch: 'main',
    };
    const result = resolveToolingConfig(projectRow);
    expect(result.install).toBe('bun install --frozen-lockfile');
    // Other defaults should still be present
    expect(result.typescript).toBe('pnpm tsc --noEmit');
    expect(result.lint).toBe('pnpm lint');
    expect(result.unit).toBe('pnpm test -- --run');
  });

  it('resolveToolingConfig merges custom install with other custom fields', () => {
    const projectRow: ProjectRow = {
      id: 'proj-4',
      tooling_config: {
        install: 'yarn install --frozen-lockfile',
        lint: 'yarn lint',
        // typescript and unit should come from defaults
      },
      name: 'yarn-project',
      repo_url: 'https://github.com/test/yarn-repo',
      default_branch: 'main',
    };
    const result = resolveToolingConfig(projectRow);
    expect(result.install).toBe('yarn install --frozen-lockfile');
    expect(result.lint).toBe('yarn lint');
    // Defaults for fields not overridden
    expect(result.typescript).toBe('pnpm tsc --noEmit');
    expect(result.unit).toBe('pnpm test -- --run');
  });
});
