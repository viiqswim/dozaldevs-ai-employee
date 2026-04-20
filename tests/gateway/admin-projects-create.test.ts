import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import express from 'express';
import { TestApp, getPrisma, cleanupTestData, disconnectPrisma, ADMIN_TEST_KEY } from '../setup.js';
import { adminProjectRoutes } from '../../src/gateway/routes/admin-projects.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

const VALID_PAYLOAD = {
  name: 'Admin Test Project',
  jira_project_key: 'ADMINTEST',
  repo_url: 'https://github.com/testorg/test-admin-repo',
};

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

describe('POST /admin/tenants/:tenantId/projects', () => {
  it('missing X-Admin-Key header → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${TENANT_ID}/projects`,
      headers: { 'content-type': 'application/json' },
      payload: VALID_PAYLOAD,
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe('Unauthorized');
  });

  it('wrong X-Admin-Key value → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${TENANT_ID}/projects`,
      headers: {
        'content-type': 'application/json',
        'x-admin-key': 'totally-wrong-key',
      },
      payload: VALID_PAYLOAD,
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe('Unauthorized');
  });

  it('valid key + invalid body (missing repo_url) → 400 with Zod issues', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${TENANT_ID}/projects`,
      headers: {
        'content-type': 'application/json',
        'x-admin-key': ADMIN_TEST_KEY,
      },
      payload: { name: 'Missing Repo', jira_project_key: 'MISSING' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('INVALID_REQUEST');
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it('valid key + valid body → 201 with project payload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${TENANT_ID}/projects`,
      headers: {
        'content-type': 'application/json',
        'x-admin-key': ADMIN_TEST_KEY,
      },
      payload: VALID_PAYLOAD,
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBeTruthy();
    expect(body.jira_project_key).toBe('ADMINTEST');
    expect(body.repo_url).toBe('https://github.com/testorg/test-admin-repo');
  });

  it("valid key + duplicate jira_project_key (seed 'TEST') → 409", async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${TENANT_ID}/projects`,
      headers: {
        'content-type': 'application/json',
        'x-admin-key': ADMIN_TEST_KEY,
      },
      payload: {
        name: 'Duplicate Project',
        jira_project_key: 'TEST',
        repo_url: 'https://github.com/testorg/another-repo',
      },
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('CONFLICT');
    expect(typeof body.message).toBe('string');
  });

  it('valid key + valid body → project persisted in DB', async () => {
    await app.inject({
      method: 'POST',
      url: `/admin/tenants/${TENANT_ID}/projects`,
      headers: {
        'content-type': 'application/json',
        'x-admin-key': ADMIN_TEST_KEY,
      },
      payload: VALID_PAYLOAD,
    });

    const prisma = getPrisma();
    const project = await prisma.project.findFirst({
      where: { jira_project_key: 'ADMINTEST' },
    });
    expect(project).not.toBeNull();
    expect(project!.jira_project_key).toBe('ADMINTEST');
    expect(project!.repo_url).toBe('https://github.com/testorg/test-admin-repo');
    expect(project!.name).toBe('Admin Test Project');
  });
});
