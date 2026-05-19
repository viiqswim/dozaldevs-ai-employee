import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { adminArchetypesRoutes } from '../admin-archetypes.js';

const ADMIN_KEY = 'test-admin-key';
const TENANT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';
const NOW = new Date('2026-01-01T00:00:00Z');

function makeArchetype(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d6',
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

describe('POST /admin/tenants/:tenantId/archetypes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('401 when X-Admin-Key header is missing', async () => {
    const app = makeApp();
    const res = await request(app).post(`/admin/tenants/${TENANT_ID}/archetypes`).send(VALID_BODY);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('400 when role_name is invalid format (uppercase and punctuation)', async () => {
    const app = makeApp();
    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/archetypes`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ ...VALID_BODY, role_name: 'My Invalid Name!' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
  });

  it('400 when required fields are missing (only role_name provided)', async () => {
    const app = makeApp();
    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/archetypes`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ role_name: 'test' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
  });

  it('201 with created archetype body on valid input', async () => {
    const archetype = makeArchetype();
    const create = vi.fn().mockResolvedValue(archetype);
    const app = makeApp({ create });
    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/archetypes`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send(VALID_BODY);
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.role_name).toBe('daily-digest');
    expect(res.body.model).toBe('minimax/minimax-m2.7');
    expect(create).toHaveBeenCalledOnce();
  });

  it('409 with ROLE_NAME_TAKEN on duplicate role_name (Prisma P2002)', async () => {
    const create = vi.fn().mockRejectedValue({ code: 'P2002' });
    const app = makeApp({ create });
    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/archetypes`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send(VALID_BODY);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ROLE_NAME_TAKEN');
  });
});
