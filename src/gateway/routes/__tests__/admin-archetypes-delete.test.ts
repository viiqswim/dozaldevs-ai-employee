import { describe, it, expect, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { adminArchetypesRoutes } from '../admin-archetypes.js';

const TEST_DB_URL = 'postgresql://postgres:postgres@localhost:54322/ai_employee_test';
const ADMIN_KEY = 'test-admin-key';
const TENANT_ID = '00000000-0000-0000-0000-000000000002';

process.env.ADMIN_API_KEY = ADMIN_KEY;
process.env.ENCRYPTION_KEY = 'a'.repeat(64);

const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DB_URL } },
});

const app = express();
app.use(express.json());
app.use(adminArchetypesRoutes({ prisma }));

const createdArchetypeIds: string[] = [];
const createdTaskIds: string[] = [];

async function makeArchetype(overrides: Record<string, unknown> = {}) {
  const archetype = await prisma.archetype.create({
    data: {
      tenant_id: TENANT_ID,
      role_name: `test-del-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      model: 'minimax/minimax-m2.7',
      runtime: 'opencode',
      instructions: 'Test instructions for delete tests',
      agents_md: 'Test agents md for delete tests',
      status: 'active',
      ...overrides,
    },
  });
  createdArchetypeIds.push(archetype.id);
  return archetype;
}

async function makeTask(archetypeId: string, status: string) {
  const task = await prisma.task.create({
    data: { tenant_id: TENANT_ID, archetype_id: archetypeId, status },
  });
  createdTaskIds.push(task.id);
  return task;
}

afterEach(async () => {
  if (createdTaskIds.length > 0) {
    await prisma.task.deleteMany({ where: { id: { in: [...createdTaskIds] } } });
    createdTaskIds.length = 0;
  }
  if (createdArchetypeIds.length > 0) {
    await prisma.archetype.deleteMany({ where: { id: { in: [...createdArchetypeIds] } } });
    createdArchetypeIds.length = 0;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('DELETE /admin/tenants/:tenantId/archetypes/:archetypeId', () => {
  it('200 with non-null deleted_at on happy path', async () => {
    const archetype = await makeArchetype();

    const res = await request(app)
      .delete(`/admin/tenants/${TENANT_ID}/archetypes/${archetype.id}`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(archetype.id);
    expect(res.body.deleted_at).not.toBeNull();
    expect(new Date(res.body.deleted_at as string).getTime()).toBeGreaterThan(0);
  });

  it('404 when archetype does not exist', async () => {
    const res = await request(app)
      .delete(`/admin/tenants/${TENANT_ID}/archetypes/00000000-0000-0000-0000-000000009999`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('200 on second DELETE (idempotent)', async () => {
    const archetype = await makeArchetype();

    const first = await request(app)
      .delete(`/admin/tenants/${TENANT_ID}/archetypes/${archetype.id}`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(first.status).toBe(200);

    const second = await request(app)
      .delete(`/admin/tenants/${TENANT_ID}/archetypes/${archetype.id}`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(archetype.id);
    expect(second.body.deleted_at).not.toBeNull();
  });

  it('409 ACTIVE_TASKS with activeTaskCount:1 when Executing task exists', async () => {
    const archetype = await makeArchetype();
    await makeTask(archetype.id, 'Executing');

    const res = await request(app)
      .delete(`/admin/tenants/${TENANT_ID}/archetypes/${archetype.id}`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ACTIVE_TASKS');
    expect(res.body.activeTaskCount).toBe(1);
  });

  it('200 when all linked tasks are in terminal status (Done)', async () => {
    const archetype = await makeArchetype();
    await makeTask(archetype.id, 'Done');

    const res = await request(app)
      .delete(`/admin/tenants/${TENANT_ID}/archetypes/${archetype.id}`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body.deleted_at).not.toBeNull();
  });
});

describe('POST /admin/tenants/:tenantId/archetypes/:archetypeId/restore', () => {
  it('200 with deleted_at null on restore happy path', async () => {
    const archetype = await makeArchetype();
    await request(app)
      .delete(`/admin/tenants/${TENANT_ID}/archetypes/${archetype.id}`)
      .set('X-Admin-Key', ADMIN_KEY);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/archetypes/${archetype.id}/restore`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(archetype.id);
    expect(res.body.deleted_at).toBeNull();
  });

  it('404 when archetype does not exist', async () => {
    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/archetypes/00000000-0000-0000-0000-000000009999/restore`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('200 when restoring an already-active archetype (idempotent)', async () => {
    const archetype = await makeArchetype();

    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/archetypes/${archetype.id}/restore`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(archetype.id);
    expect(res.body.deleted_at).toBeNull();
  });

  it('409 CONFLICT when active archetype has same role_name', async () => {
    const roleName = `test-collision-${Date.now()}`;

    await makeArchetype({ role_name: roleName });
    const archetypeB = await makeArchetype({ role_name: roleName, status: 'draft' });

    await request(app)
      .delete(`/admin/tenants/${TENANT_ID}/archetypes/${archetypeB.id}`)
      .set('X-Admin-Key', ADMIN_KEY);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/archetypes/${archetypeB.id}/restore`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
  });
});
