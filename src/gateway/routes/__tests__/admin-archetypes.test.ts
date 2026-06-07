import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { adminArchetypesRoutes } from '../admin-archetypes.js';

const ADMIN_KEY = 'test-admin-key';
const TENANT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';
const ARCHETYPE_ID = 'c1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d7';
const CONFLICT_ID = 'd1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d8';
const NOW = new Date('2026-01-01T00:00:00Z');

function makeArchetype(overrides: Record<string, unknown> = {}) {
  return {
    id: ARCHETYPE_ID,
    tenant_id: TENANT_ID,
    role_name: 'daily-digest',
    model: 'minimax/minimax-m2.7',
    runtime: 'opencode',
    instructions: 'Step 1.\nStep 2.\nStep 3. Write to /tmp/summary.txt',
    agents_md: 'You are a digest bot.',
    system_prompt: '',
    delivery_instructions: null,
    deliverable_type: 'slack_message',
    risk_model: { approval_required: false, timeout_hours: 2 },
    notification_channel: null,
    concurrency_limit: 3,
    trigger_sources: null,
    tool_registry: null,
    vm_size: null,
    status: 'active',
    overview: null,
    parent_draft_id: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makeApp(prismaOverrides: Record<string, unknown> = {}) {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  const app = express();
  app.use(express.json());
  app.use(
    adminArchetypesRoutes({
      prisma: {
        archetype: {
          create: vi.fn(),
          findFirst: vi.fn(),
          update: vi.fn(),
          ...prismaOverrides,
        },
      } as never,
    }),
  );
  return app;
}

const VALID_BODY = {
  role_name: 'daily-digest',
  model: 'minimax/minimax-m2.7',
  runtime: 'opencode',
  instructions: 'Step 1.\nStep 2.\nStep 3. Write to /tmp/summary.txt',
  agents_md: 'You are a daily digest bot.\n\nWORKFLOW:\n1. Fetch data.\n2. Post to Slack.',
  notification_channel: '#test-channel',
};

describe('Draft flow — POST /admin/tenants/:tenantId/archetypes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('201 with status "draft" when status is explicitly set to "draft"', async () => {
    const draftArchetype = makeArchetype({ status: 'draft' });
    const create = vi.fn().mockResolvedValue(draftArchetype);
    const app = makeApp({ create });
    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/archetypes`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ ...VALID_BODY, status: 'draft' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
    expect(create).toHaveBeenCalledOnce();
  });

  it('201 with status "active" when status field is omitted (schema defaults to active)', async () => {
    const activeArchetype = makeArchetype({ status: 'active' });
    const create = vi.fn().mockResolvedValue(activeArchetype);
    const app = makeApp({ create });
    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/archetypes`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send(VALID_BODY);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('active');
    expect(create).toHaveBeenCalledOnce();
  });

  it('400 when status is an invalid value', async () => {
    const app = makeApp();
    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/archetypes`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ ...VALID_BODY, status: 'published' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
  });
});

describe('Draft flow — PATCH /admin/tenants/:tenantId/archetypes/:archetypeId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('409 when activating a draft that conflicts with an active archetype for the same role_name', async () => {
    const existingDraft = makeArchetype({ status: 'draft' });
    const conflictArchetype = makeArchetype({ id: CONFLICT_ID, status: 'active' });
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(existingDraft)
      .mockResolvedValueOnce(conflictArchetype);
    const app = makeApp({ findFirst });
    const res = await request(app)
      .patch(`/admin/tenants/${TENANT_ID}/archetypes/${ARCHETYPE_ID}`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ status: 'active' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ROLE_NAME_CONFLICT');
    expect(res.body.message).toMatch(/role_name/);
  });

  it('200 when activating a draft with no conflicting active archetype', async () => {
    const existingDraft = makeArchetype({ status: 'draft' });
    const updatedArchetype = makeArchetype({ status: 'active' });
    const findFirst = vi.fn().mockResolvedValueOnce(existingDraft).mockResolvedValueOnce(null);
    const update = vi.fn().mockResolvedValue(updatedArchetype);
    const app = makeApp({ findFirst, update });
    const res = await request(app)
      .patch(`/admin/tenants/${TENANT_ID}/archetypes/${ARCHETYPE_ID}`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ status: 'active' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    expect(update).toHaveBeenCalledOnce();
  });

  it('404 when archetype does not exist', async () => {
    const findFirst = vi.fn().mockResolvedValueOnce(null);
    const app = makeApp({ findFirst });
    const res = await request(app)
      .patch(`/admin/tenants/${TENANT_ID}/archetypes/${ARCHETYPE_ID}`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ status: 'draft' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});
