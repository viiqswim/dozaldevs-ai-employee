import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { adminArchetypesRoutes } from '../../../../src/gateway/routes/admin-archetypes.js';

vi.mock('../../../../src/gateway/middleware/auth.js', () => ({
  authMiddleware: (req: Request, _res: Response, next: NextFunction): void => {
    (req as Request & { isServiceToken?: boolean }).isServiceToken = true;
    next();
  },
}));

vi.mock('../../../../src/gateway/middleware/authz.js', () => ({
  requireAuth: (_req: Request, _res: Response, next: NextFunction): void => {
    next();
  },
  requireTenantRole:
    () =>
    (_req: Request, _res: Response, next: NextFunction): void => {
      next();
    },
  requirePermission:
    () =>
    (_req: Request, _res: Response, next: NextFunction): void => {
      next();
    },
}));

vi.mock('../../../../src/gateway/services/time-estimator.js', () => ({
  TimeEstimator: vi.fn().mockImplementation(() => ({
    estimate: vi.fn().mockResolvedValue(null),
  })),
  shouldReEstimate: vi.fn().mockReturnValue(false),
}));

vi.mock('../../../../src/lib/call-llm.js', () => ({
  callLLM: vi.fn(),
}));

const TENANT = '11111111-1111-4111-8111-111111111111';
const ARCHETYPE_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';

function makeArchetype(overrides: Record<string, unknown> = {}) {
  return {
    id: ARCHETYPE_ID,
    tenant_id: TENANT,
    role_name: 'test-employee',
    identity: 'Original identity',
    execution_steps: 'Do the thing',
    delivery_steps: null,
    status: 'active',
    model: 'deepseek/deepseek-v4-flash',
    runtime: 'opencode',
    execution_instructions: 'Run it',
    delivery_instructions: null,
    deliverable_type: null,
    risk_model: { approval_required: false, timeout_hours: 2 },
    trigger_sources: null,
    tool_registry: null,
    overview: null,
    input_schema: null,
    worker_env: null,
    notification_channel: null,
    vm_size: null,
    concurrency_limit: 3,
    temperature: 1.0,
    platform_rules_override: null,
    estimated_manual_minutes: null,
    estimated_manual_minutes_override: null,
    enforce_tool_registry: false,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    deleted_at: null,
    ...overrides,
  };
}

function makeApp(prismaOverrides: Record<string, unknown> = {}) {
  const app = express();
  app.use(express.json());
  app.use(
    adminArchetypesRoutes({
      prisma: prismaOverrides as never,
    }),
  );
  return app;
}

describe('PATCH /admin/tenants/:tenantId/archetypes/:archetypeId — identity field', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('200 — identity is accepted and passed to prisma.archetype.update', async () => {
    const existing = makeArchetype();
    const updated = makeArchetype({ identity: 'QA persona ABC' });

    const findFirst = vi.fn().mockResolvedValue(existing);
    const update = vi.fn().mockResolvedValue(updated);

    const app = makeApp({
      archetype: { findFirst, update },
    });

    const res = await request(app)
      .patch(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}`)
      .send({ identity: 'QA persona ABC' });

    expect(res.status).toBe(200);
    expect(res.body.identity).toBe('QA persona ABC');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ identity: 'QA persona ABC' }),
      }),
    );
  });

  it('200 — identity can be set to null', async () => {
    const existing = makeArchetype({ identity: 'Some identity' });
    const updated = makeArchetype({ identity: null });

    const findFirst = vi.fn().mockResolvedValue(existing);
    const update = vi.fn().mockResolvedValue(updated);

    const app = makeApp({
      archetype: { findFirst, update },
    });

    const res = await request(app)
      .patch(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}`)
      .send({ identity: null });

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ identity: null }),
      }),
    );
  });

  it('400 — identity as a number is rejected', async () => {
    const findFirst = vi.fn();
    const update = vi.fn();

    const app = makeApp({
      archetype: { findFirst, update },
    });

    const res = await request(app)
      .patch(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}`)
      .send({ identity: 123 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
    expect(update).not.toHaveBeenCalled();
  });

  it('400 — identity exceeding 10000 chars is rejected', async () => {
    const findFirst = vi.fn();
    const update = vi.fn();

    const app = makeApp({
      archetype: { findFirst, update },
    });

    const res = await request(app)
      .patch(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}`)
      .send({ identity: 'x'.repeat(10001) });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
    expect(update).not.toHaveBeenCalled();
  });
});
