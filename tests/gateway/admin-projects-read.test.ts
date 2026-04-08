import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { getPrisma, cleanupTestData, disconnectPrisma, ADMIN_TEST_KEY } from '../setup.js';
import { adminProjectRoutes } from '../../src/gateway/routes/admin-projects.js';

const SEED_PROJECT_ID = '00000000-0000-0000-0000-000000000003';
const NONEXISTENT_UUID = '00000000-0000-0000-0000-999999999999';

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

describe('GET /admin/projects', () => {
  it('missing X-Admin-Key header → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/projects',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe('Unauthorized');
  });

  it('valid key → 200 with projects array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/projects',
      headers: {
        'content-type': 'application/json',
        'x-admin-key': ADMIN_TEST_KEY,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.projects)).toBe(true);
  });

  it('valid key → returns seed project in list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/projects',
      headers: {
        'content-type': 'application/json',
        'x-admin-key': ADMIN_TEST_KEY,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const seedProject = body.projects.find((p: { id: string }) => p.id === SEED_PROJECT_ID);
    expect(seedProject).toBeTruthy();
    expect(seedProject.jira_project_key).toBe('TEST');
  });
});

describe('GET /admin/projects/:id', () => {
  it('missing X-Admin-Key header → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/projects/${SEED_PROJECT_ID}`,
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe('Unauthorized');
  });

  it('valid key + seed project id → 200 with project payload', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/projects/${SEED_PROJECT_ID}`,
      headers: {
        'content-type': 'application/json',
        'x-admin-key': ADMIN_TEST_KEY,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(SEED_PROJECT_ID);
    expect(body.jira_project_key).toBe('TEST');
  });

  it('valid key + nonexistent uuid → 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/projects/${NONEXISTENT_UUID}`,
      headers: {
        'content-type': 'application/json',
        'x-admin-key': ADMIN_TEST_KEY,
      },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe('NOT_FOUND');
  });

  it('valid key + malformed id (not-a-uuid) → 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/projects/not-a-uuid',
      headers: {
        'content-type': 'application/json',
        'x-admin-key': ADMIN_TEST_KEY,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('INVALID_ID');
  });
});
