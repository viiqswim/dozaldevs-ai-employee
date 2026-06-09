import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { adminArchetypesRoutes } from '../admin-archetypes.js';
import { TimeEstimator, shouldReEstimate } from '../../services/time-estimator.js';

vi.mock('../../services/time-estimator.js', () => ({
  TimeEstimator: vi.fn(),
  shouldReEstimate: vi.fn(),
}));

const ADMIN_KEY = 'test-admin-key';
const TENANT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';
const ARCHETYPE_ID = 'c1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d7';
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
    estimated_manual_minutes: null,
    estimated_manual_minutes_override: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makeApp(prismaOverrides: Record<string, unknown> = {}) {
  process.env.SERVICE_TOKEN = ADMIN_KEY;
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

describe('Time estimation — POST /admin/tenants/:tenantId/archetypes', () => {
  let mockEstimate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEstimate = vi.fn().mockResolvedValue(42);
    vi.mocked(TimeEstimator).mockImplementation(() => ({ estimate: mockEstimate }) as never);
    vi.mocked(shouldReEstimate).mockReturnValue(false);
  });

  it('calls estimate on create and returns archetype with estimated_manual_minutes', async () => {
    const base = makeArchetype({ estimated_manual_minutes: null });
    const withEstimate = makeArchetype({ estimated_manual_minutes: 42 });
    const create = vi.fn().mockResolvedValue(base);
    const update = vi.fn().mockResolvedValue(withEstimate);
    const app = makeApp({ create, update });

    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/archetypes`)
      .set('Authorization', `Bearer ${ADMIN_KEY}`)
      .send(VALID_BODY);

    expect(res.status).toBe(201);
    expect(mockEstimate).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { estimated_manual_minutes: 42 } }),
    );
    expect(res.body.estimated_manual_minutes).toBe(42);
  });

  it('creates archetype with null estimated_manual_minutes when estimate returns null', async () => {
    mockEstimate = vi.fn().mockResolvedValue(null);
    const base = makeArchetype({ estimated_manual_minutes: null });
    const create = vi.fn().mockResolvedValue(base);
    const update = vi.fn();
    const app = makeApp({ create, update });

    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/archetypes`)
      .set('Authorization', `Bearer ${ADMIN_KEY}`)
      .send(VALID_BODY);

    expect(res.status).toBe(201);
    expect(mockEstimate).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
    expect(res.body.estimated_manual_minutes).toBeNull();
  });
});

describe('Time estimation — PATCH /admin/tenants/:tenantId/archetypes/:archetypeId', () => {
  let mockEstimate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEstimate = vi.fn().mockResolvedValue(42);
    vi.mocked(TimeEstimator).mockImplementation(() => ({ estimate: mockEstimate }) as never);
    vi.mocked(shouldReEstimate).mockReturnValue(false);
  });

  it('triggers re-estimation when instructions field changes', async () => {
    vi.mocked(shouldReEstimate).mockReturnValue(true);

    const existing = makeArchetype();
    const afterUpdate = makeArchetype({ instructions: 'New instructions' });
    const withEstimate = makeArchetype({
      instructions: 'New instructions',
      estimated_manual_minutes: 42,
    });
    const findFirst = vi.fn().mockResolvedValue(existing);
    const update = vi.fn().mockResolvedValueOnce(afterUpdate).mockResolvedValueOnce(withEstimate);
    const app = makeApp({ findFirst, update });

    const res = await request(app)
      .patch(`/admin/tenants/${TENANT_ID}/archetypes/${ARCHETYPE_ID}`)
      .set('Authorization', `Bearer ${ADMIN_KEY}`)
      .send({ instructions: 'New instructions' });

    expect(res.status).toBe(200);
    expect(mockEstimate).toHaveBeenCalledOnce();
    expect(res.body.estimated_manual_minutes).toBe(42);
  });

  it('skips re-estimation when only non-content fields change', async () => {
    vi.mocked(shouldReEstimate).mockReturnValue(false);

    const existing = makeArchetype();
    const afterUpdate = makeArchetype({ notification_channel: '#new-channel' });
    const findFirst = vi.fn().mockResolvedValue(existing);
    const update = vi.fn().mockResolvedValue(afterUpdate);
    const app = makeApp({ findFirst, update });

    const res = await request(app)
      .patch(`/admin/tenants/${TENANT_ID}/archetypes/${ARCHETYPE_ID}`)
      .set('Authorization', `Bearer ${ADMIN_KEY}`)
      .send({ notification_channel: '#new-channel' });

    expect(res.status).toBe(200);
    expect(mockEstimate).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });

  it('persists estimated_manual_minutes_override when provided', async () => {
    const existing = makeArchetype();
    const afterUpdate = makeArchetype({ estimated_manual_minutes_override: 25 });
    const findFirst = vi.fn().mockResolvedValue(existing);
    const update = vi.fn().mockResolvedValue(afterUpdate);
    const app = makeApp({ findFirst, update });

    const res = await request(app)
      .patch(`/admin/tenants/${TENANT_ID}/archetypes/${ARCHETYPE_ID}`)
      .set('Authorization', `Bearer ${ADMIN_KEY}`)
      .send({ estimated_manual_minutes_override: 25 });

    expect(res.status).toBe(200);
    expect(res.body.estimated_manual_minutes_override).toBe(25);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estimated_manual_minutes_override: 25 }),
      }),
    );
  });

  it('clears override when null is provided', async () => {
    const existing = makeArchetype({ estimated_manual_minutes_override: 25 });
    const afterUpdate = makeArchetype({ estimated_manual_minutes_override: null });
    const findFirst = vi.fn().mockResolvedValue(existing);
    const update = vi.fn().mockResolvedValue(afterUpdate);
    const app = makeApp({ findFirst, update });

    const res = await request(app)
      .patch(`/admin/tenants/${TENANT_ID}/archetypes/${ARCHETYPE_ID}`)
      .set('Authorization', `Bearer ${ADMIN_KEY}`)
      .send({ estimated_manual_minutes_override: null });

    expect(res.status).toBe(200);
    expect(res.body.estimated_manual_minutes_override).toBeNull();
  });

  it('returns 400 when override is 0', async () => {
    const app = makeApp();

    const res = await request(app)
      .patch(`/admin/tenants/${TENANT_ID}/archetypes/${ARCHETYPE_ID}`)
      .set('Authorization', `Bearer ${ADMIN_KEY}`)
      .send({ estimated_manual_minutes_override: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
  });

  it('returns 400 when override is 1441', async () => {
    const app = makeApp();

    const res = await request(app)
      .patch(`/admin/tenants/${TENANT_ID}/archetypes/${ARCHETYPE_ID}`)
      .set('Authorization', `Bearer ${ADMIN_KEY}`)
      .send({ estimated_manual_minutes_override: 1441 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
  });
});
