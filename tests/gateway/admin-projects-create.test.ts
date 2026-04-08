import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { getPrisma, cleanupTestData, disconnectPrisma, ADMIN_TEST_KEY } from '../setup.js';
import { adminProjectRoutes } from '../../src/gateway/routes/admin-projects.js';

const VALID_PAYLOAD = {
  name: 'Admin Test Project',
  jira_project_key: 'ADMINTEST',
  repo_url: 'https://github.com/testorg/test-admin-repo',
};

let app: FastifyInstance;

beforeEach(async () => {
  process.env.ADMIN_API_KEY = ADMIN_TEST_KEY;
  process.env.JIRA_WEBHOOK_SECRET = process.env.JIRA_WEBHOOK_SECRET ?? 'test-secret';

  app = Fastify({ logger: false });
  await app.register(adminProjectRoutes, { prisma: getPrisma() });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await cleanupTestData();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('POST /admin/projects', () => {
  it('missing X-Admin-Key header → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/projects',
      headers: { 'content-type': 'application/json' },
      payload: VALID_PAYLOAD,
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe('Unauthorized');
  });

  it('wrong X-Admin-Key value → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/projects',
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
      url: '/admin/projects',
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
      url: '/admin/projects',
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
      url: '/admin/projects',
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
      url: '/admin/projects',
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
