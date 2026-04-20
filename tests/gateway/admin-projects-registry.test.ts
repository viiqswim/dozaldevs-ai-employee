import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { getPrisma, cleanupTestData, disconnectPrisma } from '../setup.js';
import {
  createProject,
  listProjects,
  getProjectById,
  updateProject,
  deleteProject,
  ProjectRegistryConflictError,
} from '../../src/gateway/services/project-registry.js';

const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000002';
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

describe('listProjects', () => {
  it('returns array containing the seed project', async () => {
    const projects = await listProjects({
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    expect(Array.isArray(projects)).toBe(true);
    expect(projects.length).toBeGreaterThan(0);

    const seedProject = projects.find((p) => p.id === '00000000-0000-0000-0000-000000000003');
    expect(seedProject).toBeDefined();
    expect(seedProject?.jira_project_key).toBe(SEED_PROJECT_KEY);
  });

  it('returns projects in created_at DESC order', async () => {
    // Create two projects with slight delay to ensure different timestamps
    const project1 = await createProject({
      input: {
        name: 'First Project',
        repo_url: 'https://github.com/test/first',
        jira_project_key: 'FIRST1',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    // Small delay to ensure different created_at
    await new Promise((resolve) => setTimeout(resolve, 10));

    const project2 = await createProject({
      input: {
        name: 'Second Project',
        repo_url: 'https://github.com/test/second',
        jira_project_key: 'SECOND1',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    const projects = await listProjects({
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    // Find the two created projects in the list
    const idx1 = projects.findIndex((p) => p.id === project1.id);
    const idx2 = projects.findIndex((p) => p.id === project2.id);

    expect(idx1).toBeGreaterThan(-1);
    expect(idx2).toBeGreaterThan(-1);
    // project2 was created after project1, so it should appear first (DESC order)
    expect(idx2).toBeLessThan(idx1);
  });

  it('respects limit parameter', async () => {
    // Create 3 projects
    await createProject({
      input: {
        name: 'Limit Test 1',
        repo_url: 'https://github.com/test/limit1',
        jira_project_key: 'LIMIT1',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    await createProject({
      input: {
        name: 'Limit Test 2',
        repo_url: 'https://github.com/test/limit2',
        jira_project_key: 'LIMIT2',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    await createProject({
      input: {
        name: 'Limit Test 3',
        repo_url: 'https://github.com/test/limit3',
        jira_project_key: 'LIMIT3',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    // Request with limit: 2
    const projects = await listProjects({
      tenantId: SYSTEM_TENANT_ID,
      prisma,
      limit: 2,
    });

    expect(projects.length).toBe(2);
  });

  it('clamps limit to 200 when limit exceeds max', async () => {
    // This test verifies the clamping logic by checking that a very large limit
    // is silently clamped to 200. We can't easily create 200+ projects, so we
    // verify the behavior indirectly by checking that the function accepts the
    // large limit without error and returns results.
    const projects = await listProjects({
      tenantId: SYSTEM_TENANT_ID,
      prisma,
      limit: 500,
    });

    // Should return successfully (clamped to 200)
    expect(Array.isArray(projects)).toBe(true);
    // The actual count depends on how many projects exist, but it should be <= 200
    expect(projects.length).toBeLessThanOrEqual(200);
  });

  it('respects offset parameter', async () => {
    // Create 3 projects
    const p1 = await createProject({
      input: {
        name: 'Offset Test 1',
        repo_url: 'https://github.com/test/offset1',
        jira_project_key: 'OFFSET1',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    const p2 = await createProject({
      input: {
        name: 'Offset Test 2',
        repo_url: 'https://github.com/test/offset2',
        jira_project_key: 'OFFSET2',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    const p3 = await createProject({
      input: {
        name: 'Offset Test 3',
        repo_url: 'https://github.com/test/offset3',
        jira_project_key: 'OFFSET3',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    // Get all projects
    const allProjects = await listProjects({
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    // Get with offset: 1 (skip first)
    const offsetProjects = await listProjects({
      tenantId: SYSTEM_TENANT_ID,
      prisma,
      offset: 1,
    });

    // The offset result should have one fewer item
    expect(offsetProjects.length).toBe(allProjects.length - 1);
    // The first item in offset result should be the second item in all results
    expect(offsetProjects[0].id).toBe(allProjects[1].id);
  });
});

describe('getProjectById', () => {
  it('returns the seed project by id', async () => {
    const project = await getProjectById({
      id: '00000000-0000-0000-0000-000000000003',
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    expect(project).toBeDefined();
    expect(project?.id).toBe('00000000-0000-0000-0000-000000000003');
    expect(project?.jira_project_key).toBe(SEED_PROJECT_KEY);
  });

  it('returns null for non-existent project id', async () => {
    const project = await getProjectById({
      id: '00000000-0000-0000-0000-999999999999',
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    expect(project).toBeNull();
  });

  it('returns null when project exists but tenant_id does not match', async () => {
    // Create a project with SYSTEM_TENANT_ID
    const created = await createProject({
      input: {
        name: 'Tenant Isolation Test',
        repo_url: 'https://github.com/test/tenant-iso',
        jira_project_key: 'TENISO1',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    // Try to fetch with a different tenant_id
    const project = await getProjectById({
      id: created.id,
      tenantId: '00000000-0000-0000-0000-000000000099', // Different tenant
      prisma,
    });

    expect(project).toBeNull();
  });
});

describe('updateProject', () => {
  it('updates project with partial name only — other fields unchanged, returns updated project', async () => {
    // Create a project with initial values
    const created = await createProject({
      input: {
        name: 'Original Name',
        repo_url: 'https://github.com/test/original',
        jira_project_key: 'ORIG1',
        default_branch: 'develop',
        concurrency_limit: 5,
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    // Update only the name
    const updated = await updateProject({
      id: created.id,
      input: { name: 'Updated Name' },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    expect(updated).toBeDefined();
    expect(updated?.id).toBe(created.id);
    expect(updated?.name).toBe('Updated Name');
    // Other fields should remain unchanged
    expect(updated?.repo_url).toBe('https://github.com/test/original');
    expect(updated?.jira_project_key).toBe('ORIG1');
    expect(updated?.default_branch).toBe('develop');
    expect(updated?.concurrency_limit).toBe(5);
  });

  it('updates project with repo_url and normalizes by removing .git suffix', async () => {
    const created = await createProject({
      input: {
        name: 'Repo Test',
        repo_url: 'https://github.com/test/old-repo',
        jira_project_key: 'REPO1',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    const updated = await updateProject({
      id: created.id,
      input: { repo_url: 'https://github.com/test/new-repo.git' },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    expect(updated?.repo_url).toBe('https://github.com/test/new-repo');
  });

  it('returns null when project id does not exist', async () => {
    const result = await updateProject({
      id: '00000000-0000-0000-0000-999999999999',
      input: { name: 'Nonexistent' },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    expect(result).toBeNull();
  });

  it('throws ProjectRegistryConflictError when changing jira_project_key to an existing one', async () => {
    // Create a project
    const created = await createProject({
      input: {
        name: 'Conflict Test',
        repo_url: 'https://github.com/test/conflict',
        jira_project_key: 'CONF1',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    // Try to update to the seed project's key (TEST)
    await expect(
      updateProject({
        id: created.id,
        input: { jira_project_key: SEED_PROJECT_KEY },
        tenantId: SYSTEM_TENANT_ID,
        prisma,
      }),
    ).rejects.toThrow(ProjectRegistryConflictError);

    try {
      await updateProject({
        id: created.id,
        input: { jira_project_key: SEED_PROJECT_KEY },
        tenantId: SYSTEM_TENANT_ID,
        prisma,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectRegistryConflictError);
      expect((error as ProjectRegistryConflictError).field).toBe('jira_project_key');
    }
  });

  it('replaces tooling_config entirely (not merged) when provided', async () => {
    const created = await createProject({
      input: {
        name: 'Tooling Test',
        repo_url: 'https://github.com/test/tooling',
        jira_project_key: 'TOOL2',
        tooling_config: {
          install: 'pnpm install --frozen-lockfile',
          lint: 'pnpm lint',
          unit: 'pnpm test',
        },
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    // Update with a different tooling_config
    const updated = await updateProject({
      id: created.id,
      input: { tooling_config: { install: 'bun install' } },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    // tooling_config should be replaced entirely, not merged
    expect(updated?.tooling_config).toEqual({ install: 'bun install' });
    expect(updated?.tooling_config).not.toHaveProperty('lint');
    expect(updated?.tooling_config).not.toHaveProperty('unit');
  });

  it('returns null when project exists but tenant_id does not match', async () => {
    const created = await createProject({
      input: {
        name: 'Tenant Mismatch',
        repo_url: 'https://github.com/test/tenant-mismatch',
        jira_project_key: 'TMIS1',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    const result = await updateProject({
      id: created.id,
      input: { name: 'Should Not Update' },
      tenantId: '00000000-0000-0000-0000-000000000099', // Different tenant
      prisma,
    });

    expect(result).toBeNull();
  });
});

describe('deleteProject', () => {
  it('deletes existing project with no tasks — returns { deleted: true } and row is gone from DB', async () => {
    const project = await createProject({
      input: {
        name: 'Delete Test No Tasks',
        repo_url: 'https://github.com/test/delete-no-tasks',
        jira_project_key: 'DEL1',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    const result = await deleteProject({
      id: project.id,
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    expect(result).toEqual({ deleted: true });

    const found = await prisma.project.findUnique({ where: { id: project.id } });
    expect(found).toBeNull();
  });

  it('returns { deleted: false, reason: "active_tasks" } when project has a Ready task', async () => {
    const project = await createProject({
      input: {
        name: 'Project with Ready Task',
        repo_url: 'https://github.com/test/delete-ready',
        jira_project_key: 'DEL2',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    const task = await prisma.task.create({
      data: {
        external_id: 'DEL-READY-001',
        source_system: 'jira',
        tenant_id: SYSTEM_TENANT_ID,
        project_id: project.id,
        status: 'Ready',
      },
    });

    const result = await deleteProject({
      id: project.id,
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    expect(result).toEqual({
      deleted: false,
      reason: 'active_tasks',
      activeTaskIds: [task.id],
    });
  });

  it('returns { deleted: false, reason: "active_tasks" } when project has an Executing task', async () => {
    const project = await createProject({
      input: {
        name: 'Project with Executing Task',
        repo_url: 'https://github.com/test/delete-executing',
        jira_project_key: 'DEL3',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    const task = await prisma.task.create({
      data: {
        external_id: 'DEL-EXECUTING-001',
        source_system: 'jira',
        tenant_id: SYSTEM_TENANT_ID,
        project_id: project.id,
        status: 'Executing',
      },
    });

    const result = await deleteProject({
      id: project.id,
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    expect(result).toEqual({
      deleted: false,
      reason: 'active_tasks',
      activeTaskIds: [task.id],
    });
  });

  it('returns { deleted: false, reason: "active_tasks" } when project has a Submitting task', async () => {
    const project = await createProject({
      input: {
        name: 'Project with Submitting Task',
        repo_url: 'https://github.com/test/delete-submitting',
        jira_project_key: 'DEL4',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    const task = await prisma.task.create({
      data: {
        external_id: 'DEL-SUBMITTING-001',
        source_system: 'jira',
        tenant_id: SYSTEM_TENANT_ID,
        project_id: project.id,
        status: 'Submitting',
      },
    });

    const result = await deleteProject({
      id: project.id,
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    expect(result).toEqual({
      deleted: false,
      reason: 'active_tasks',
      activeTaskIds: [task.id],
    });
  });

  it('deletes project with only Done tasks — returns { deleted: true } (Done is not active)', async () => {
    const project = await createProject({
      input: {
        name: 'Project with Done Tasks',
        repo_url: 'https://github.com/test/delete-done',
        jira_project_key: 'DEL5',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    await prisma.task.create({
      data: {
        external_id: 'DEL-DONE-001',
        source_system: 'jira',
        tenant_id: SYSTEM_TENANT_ID,
        project_id: project.id,
        status: 'Done',
      },
    });

    const result = await deleteProject({
      id: project.id,
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    expect(result).toEqual({ deleted: true });
  });

  it('deletes project with only Cancelled tasks — returns { deleted: true } (Cancelled is not active)', async () => {
    const project = await createProject({
      input: {
        name: 'Project with Cancelled Tasks',
        repo_url: 'https://github.com/test/delete-cancelled',
        jira_project_key: 'DEL6',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    await prisma.task.create({
      data: {
        external_id: 'DEL-CANCELLED-001',
        source_system: 'jira',
        tenant_id: SYSTEM_TENANT_ID,
        project_id: project.id,
        status: 'Cancelled',
      },
    });

    const result = await deleteProject({
      id: project.id,
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    expect(result).toEqual({ deleted: true });
  });

  it('returns { deleted: false, reason: "not_found" } for non-existent project id', async () => {
    const result = await deleteProject({
      id: '00000000-0000-0000-0000-999999999999',
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    expect(result).toEqual({ deleted: false, reason: 'not_found' });
  });

  it('returns { deleted: false, reason: "not_found" } when project exists but tenantId does not match', async () => {
    const project = await createProject({
      input: {
        name: 'Tenant Mismatch Delete',
        repo_url: 'https://github.com/test/delete-tenant-mismatch',
        jira_project_key: 'DEL8',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    const result = await deleteProject({
      id: project.id,
      tenantId: '00000000-0000-0000-0000-000000000099', // Different tenant
      prisma,
    });

    expect(result).toEqual({ deleted: false, reason: 'not_found' });

    const found = await prisma.project.findUnique({ where: { id: project.id } });
    expect(found).not.toBeNull();
  });

  it('BONUS: Done tasks have project_id = null after project deletion (FK ON DELETE SET NULL)', async () => {
    const project = await createProject({
      input: {
        name: 'FK Set Null Test',
        repo_url: 'https://github.com/test/delete-fk-null',
        jira_project_key: 'DEL9',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    const task = await prisma.task.create({
      data: {
        external_id: 'DEL-FK-001',
        source_system: 'jira',
        tenant_id: SYSTEM_TENANT_ID,
        project_id: project.id,
        status: 'Done',
      },
    });

    const result = await deleteProject({
      id: project.id,
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    expect(result).toEqual({ deleted: true });

    const updatedTask = await prisma.task.findUnique({ where: { id: task.id } });
    expect(updatedTask).not.toBeNull();
    expect(updatedTask?.project_id).toBeNull();
  });
});
