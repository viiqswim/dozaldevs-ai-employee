import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { getPrisma, cleanupTestData, disconnectPrisma } from '../setup.js';
import {
  createProject,
  ProjectRegistryConflictError,
} from '../../src/gateway/services/project-registry.js';

const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const SEED_PROJECT_KEY = 'TEST'; // Seed project jira_project_key

let prisma: PrismaClient;

beforeEach(async () => {
  prisma = getPrisma();
});

afterEach(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('createProject', () => {
  it('creates a project with all required fields and returns it with generated id', async () => {
    const input = {
      name: 'Test Project',
      repo_url: 'https://github.com/test/repo',
      jira_project_key: 'PROJ1',
      default_branch: 'main',
      concurrency_limit: 5,
    };

    const project = await createProject({
      input,
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    expect(project).toBeDefined();
    expect(project.id).toBeTruthy();
    expect(project.name).toBe('Test Project');
    expect(project.repo_url).toBe('https://github.com/test/repo');
    expect(project.jira_project_key).toBe('PROJ1');
    expect(project.default_branch).toBe('main');
    expect(project.concurrency_limit).toBe(5);
    expect(project.tenant_id).toBe(SYSTEM_TENANT_ID);
  });

  it('creates a project with optional tooling_config and persists JSON correctly', async () => {
    const toolingConfig = {
      build: 'pnpm build',
      test: 'pnpm test',
      lint: 'pnpm lint',
    };

    const input = {
      name: 'Project with Tooling',
      repo_url: 'https://github.com/test/tooling-repo',
      jira_project_key: 'TOOL1',
      tooling_config: toolingConfig,
    };

    const project = await createProject({
      input,
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    expect(project.tooling_config).toEqual(toolingConfig);

    // Verify it persists correctly by fetching from DB
    const fetched = await prisma.project.findUnique({
      where: { id: project.id },
    });

    expect(fetched?.tooling_config).toEqual(toolingConfig);
  });

  it('normalizes repo_url by removing trailing .git', async () => {
    const input = {
      name: 'Git Suffix Project',
      repo_url: 'https://github.com/test/repo.git',
      jira_project_key: 'GIT1',
    };

    const project = await createProject({
      input,
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    expect(project.repo_url).toBe('https://github.com/test/repo');
  });

  it('throws ProjectRegistryConflictError when jira_project_key already exists for tenant', async () => {
    // Seed project has jira_project_key='TEST'
    const input = {
      name: 'Duplicate Key Project',
      repo_url: 'https://github.com/test/duplicate',
      jira_project_key: SEED_PROJECT_KEY,
    };

    await expect(
      createProject({
        input,
        tenantId: SYSTEM_TENANT_ID,
        prisma,
      }),
    ).rejects.toThrow(ProjectRegistryConflictError);

    try {
      await createProject({
        input,
        tenantId: SYSTEM_TENANT_ID,
        prisma,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectRegistryConflictError);
      expect((error as ProjectRegistryConflictError).code).toBe('CONFLICT');
      expect((error as ProjectRegistryConflictError).field).toBe('jira_project_key');
    }
  });

  it('created project has correct tenant_id (SYSTEM_TENANT_ID)', async () => {
    const input = {
      name: 'Tenant Test Project',
      repo_url: 'https://github.com/test/tenant-repo',
      jira_project_key: 'TENANT1',
    };

    const project = await createProject({
      input,
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    expect(project.tenant_id).toBe(SYSTEM_TENANT_ID);

    // Verify in DB
    const fetched = await prisma.project.findUnique({
      where: { id: project.id },
    });

    expect(fetched?.tenant_id).toBe(SYSTEM_TENANT_ID);
  });
});
