import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import express from 'express';
import { TestApp, getPrisma, cleanupTestData, disconnectPrisma, ADMIN_TEST_KEY } from '../setup.js';
import { adminProjectRoutes } from '../../src/gateway/routes/admin-projects.js';
import { createProject } from '../../src/gateway/services/project-registry.js';

const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000002';

let app: TestApp;

beforeEach(async () => {
  process.env.ADMIN_API_KEY = ADMIN_TEST_KEY;
  process.env.JIRA_WEBHOOK_SECRET = process.env.JIRA_WEBHOOK_SECRET ?? 'test-secret';

  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use(adminProjectRoutes({ prisma: getPrisma() }));
  app = new TestApp(expressApp);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await cleanupTestData();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('DELETE /admin/tenants/:tenantId/projects/:id', () => {
  it('missing X-Admin-Key header → 401', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${SYSTEM_TENANT_ID}/projects/00000000-0000-0000-0000-000000000099`,
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe('Unauthorized');
  });

  it('invalid UUID format → 400 INVALID_ID', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${SYSTEM_TENANT_ID}/projects/not-a-valid-uuid`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('INVALID_ID');
  });

  it('non-existent project id → 404 NOT_FOUND', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${SYSTEM_TENANT_ID}/projects/00000000-0000-0000-0000-000000000099`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe('NOT_FOUND');
  });

  it('project with active Executing task → 409 CONFLICT with activeTaskIds', async () => {
    const prisma = getPrisma();
    const project = await createProject({
      input: {
        name: 'Delete Test Active',
        jira_project_key: 'DELTACT1',
        repo_url: 'https://github.com/testorg/delete-active-1',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    const task = await prisma.task.create({
      data: {
        project_id: project.id,
        status: 'Executing',
        tenant_id: SYSTEM_TENANT_ID,
        external_id: `del-active-exec-${Date.now()}`,
        source_system: 'jira',
      },
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${SYSTEM_TENANT_ID}/projects/${project.id}`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('CONFLICT');
    expect(typeof body.message).toBe('string');
    expect(Array.isArray(body.activeTaskIds)).toBe(true);
    expect(body.activeTaskIds).toContain(task.id);
  });

  it('project with no tasks → 204 and DB row is gone', async () => {
    const prisma = getPrisma();
    const project = await createProject({
      input: {
        name: 'Delete No Tasks',
        jira_project_key: 'DELNOTASK',
        repo_url: 'https://github.com/testorg/delete-no-tasks',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${SYSTEM_TENANT_ID}/projects/${project.id}`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });

    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');

    const found = await prisma.project.findUnique({ where: { id: project.id } });
    expect(found).toBeNull();
  });

  it('project with only Done tasks → 204 and DB row is gone', async () => {
    const prisma = getPrisma();
    const project = await createProject({
      input: {
        name: 'Delete Done Tasks',
        jira_project_key: 'DELDONETSK',
        repo_url: 'https://github.com/testorg/delete-done-tasks',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    await prisma.task.create({
      data: {
        project_id: project.id,
        status: 'Done',
        tenant_id: SYSTEM_TENANT_ID,
        external_id: `del-done-task-${Date.now()}`,
        source_system: 'jira',
      },
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${SYSTEM_TENANT_ID}/projects/${project.id}`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });

    expect(res.statusCode).toBe(204);

    const found = await prisma.project.findUnique({ where: { id: project.id } });
    expect(found).toBeNull();
  });

  it('after 409 (active task), project still exists in DB', async () => {
    const prisma = getPrisma();
    const project = await createProject({
      input: {
        name: 'Delete Persist Test',
        jira_project_key: 'DELPERSIST',
        repo_url: 'https://github.com/testorg/delete-persist',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    await prisma.task.create({
      data: {
        project_id: project.id,
        status: 'Ready',
        tenant_id: SYSTEM_TENANT_ID,
        external_id: `del-persist-ready-${Date.now()}`,
        source_system: 'jira',
      },
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${SYSTEM_TENANT_ID}/projects/${project.id}`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });

    expect(res.statusCode).toBe(409);

    const found = await prisma.project.findUnique({ where: { id: project.id } });
    expect(found).not.toBeNull();
    expect(found!.id).toBe(project.id);
  });
});
