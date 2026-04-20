import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import express from 'express';
import { TestApp, getPrisma, cleanupTestData, disconnectPrisma, ADMIN_TEST_KEY } from '../setup.js';
import { adminProjectRoutes } from '../../src/gateway/routes/admin-projects.js';
import { createProject } from '../../src/gateway/services/project-registry.js';

const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const SEED_PROJECT_KEY = 'TEST';

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

describe('PATCH /admin/tenants/:tenantId/projects/:id', () => {
  it('missing X-Admin-Key header → 401', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/tenants/${SYSTEM_TENANT_ID}/projects/00000000-0000-0000-0000-000000000003`,
      headers: { 'content-type': 'application/json' },
      payload: { name: 'Updated Name' },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe('Unauthorized');
  });

  it('PATCH non-existent id → 404', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/tenants/${SYSTEM_TENANT_ID}/projects/00000000-0000-0000-0000-000000000099`,
      headers: {
        'content-type': 'application/json',
        'x-admin-key': ADMIN_TEST_KEY,
      },
      payload: { name: 'Updated Name' },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe('NOT_FOUND');
  });

  it('PATCH with empty body → 400 (at least one field required)', async () => {
    const prisma = getPrisma();
    const project = await createProject({
      input: {
        name: 'Test Project for Empty Body',
        jira_project_key: 'PATCHTEST1',
        repo_url: 'https://github.com/testorg/patch-test-1',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/tenants/${SYSTEM_TENANT_ID}/projects/${project.id}`,
      headers: {
        'content-type': 'application/json',
        'x-admin-key': ADMIN_TEST_KEY,
      },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('INVALID_REQUEST');
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it('PATCH valid update (name only) → 200 with updated name', async () => {
    const prisma = getPrisma();
    const project = await createProject({
      input: {
        name: 'Original Name',
        jira_project_key: 'PATCHTEST2',
        repo_url: 'https://github.com/testorg/patch-test-2',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/tenants/${SYSTEM_TENANT_ID}/projects/${project.id}`,
      headers: {
        'content-type': 'application/json',
        'x-admin-key': ADMIN_TEST_KEY,
      },
      payload: { name: 'Updated Name' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Updated Name');
    expect(body.jira_project_key).toBe('PATCHTEST2');
    expect(body.id).toBe(project.id);
  });

  it('PATCH partial update (repo_url only) → 200, other fields untouched', async () => {
    const prisma = getPrisma();
    const project = await createProject({
      input: {
        name: 'Stable Name',
        jira_project_key: 'PATCHTEST3',
        repo_url: 'https://github.com/testorg/patch-test-3',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/tenants/${SYSTEM_TENANT_ID}/projects/${project.id}`,
      headers: {
        'content-type': 'application/json',
        'x-admin-key': ADMIN_TEST_KEY,
      },
      payload: { repo_url: 'https://github.com/testorg/new-repo-url' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.repo_url).toBe('https://github.com/testorg/new-repo-url');
    expect(body.name).toBe('Stable Name');
    expect(body.jira_project_key).toBe('PATCHTEST3');
  });

  it(`PATCH duplicate jira_project_key (seed '${SEED_PROJECT_KEY}') → 409`, async () => {
    const prisma = getPrisma();
    const project = await createProject({
      input: {
        name: 'Conflict Test Project',
        jira_project_key: 'PATCHTEST4',
        repo_url: 'https://github.com/testorg/patch-test-4',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/tenants/${SYSTEM_TENANT_ID}/projects/${project.id}`,
      headers: {
        'content-type': 'application/json',
        'x-admin-key': ADMIN_TEST_KEY,
      },
      payload: { jira_project_key: SEED_PROJECT_KEY },
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('CONFLICT');
    expect(typeof body.message).toBe('string');
  });

  it('PATCH with malformed id → 400', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/tenants/${SYSTEM_TENANT_ID}/projects/not-a-valid-uuid`,
      headers: {
        'content-type': 'application/json',
        'x-admin-key': ADMIN_TEST_KEY,
      },
      payload: { name: 'Should Not Reach' },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('INVALID_ID');
  });

  it('PATCH persists changes to DB', async () => {
    const prisma = getPrisma();
    const project = await createProject({
      input: {
        name: 'Before Update',
        jira_project_key: 'PATCHTEST5',
        repo_url: 'https://github.com/testorg/patch-test-5',
      },
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    await app.inject({
      method: 'PATCH',
      url: `/admin/tenants/${SYSTEM_TENANT_ID}/projects/${project.id}`,
      headers: {
        'content-type': 'application/json',
        'x-admin-key': ADMIN_TEST_KEY,
      },
      payload: { name: 'After Update' },
    });

    const updated = await prisma.project.findFirst({ where: { id: project.id } });
    expect(updated?.name).toBe('After Update');
  });
});
