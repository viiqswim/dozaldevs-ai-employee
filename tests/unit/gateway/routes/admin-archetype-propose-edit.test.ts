import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { adminArchetypeProposeEditRoutes } from '../../../../src/gateway/routes/admin-archetype-propose-edit.js';

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
}));

vi.mock('../../../../src/lib/composio/connectable-apps.js', () => ({
  getConnectableToolkits: vi.fn().mockResolvedValue(new Set(['notion', 'gmail'])),
}));

vi.mock('../../../../src/repositories/composio-connection-repository.js', () => ({
  ComposioConnectionRepository: vi.fn().mockImplementation(() => ({
    getActiveConnections: vi.fn().mockResolvedValue([]),
  })),
}));

const mockRefine = vi.fn();
vi.mock('../../../../src/gateway/services/archetype-generator.js', () => ({
  ArchetypeGenerator: vi.fn().mockImplementation(() => ({
    refine: mockRefine,
  })),
}));

const TENANT = '11111111-1111-4111-8111-111111111111';
const ARCHETYPE_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';
const VALID_TOOL = '/tools/platform/submit-output.ts';

function makeArchetype(overrides: Record<string, unknown> = {}) {
  return {
    id: ARCHETYPE_ID,
    tenant_id: TENANT,
    role_name: 'test-employee',
    identity: 'You are a helpful assistant.',
    execution_steps: 'Do the task.',
    delivery_steps: null,
    status: 'active',
    model: 'deepseek/deepseek-v4-flash',
    runtime: 'opencode',
    execution_instructions: 'Run it',
    delivery_instructions: null,
    deliverable_type: null,
    risk_model: { approval_required: false, timeout_hours: 2 },
    trigger_sources: { type: 'manual' },
    tool_registry: { tools: [VALID_TOOL] },
    overview: {
      role: 'assistant',
      trigger: 'manual',
      workflow: [],
      tools_used: '',
      output: '',
      approval: '',
    },
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

function makeRefineResult(overrides: Record<string, unknown> = {}) {
  return {
    role_name: 'test-employee',
    model: 'deepseek/deepseek-v4-flash',
    runtime: 'opencode' as const,
    identity: 'You are a helpful, concise assistant.',
    execution_steps: 'Do the task quickly.',
    delivery_steps: null,
    delivery_instructions: null,
    instructions: 'Run it',
    deliverable_type: null,
    input_schema: undefined,
    risk_model: { approval_required: false, timeout_hours: 2 },
    trigger_sources: { type: 'manual' as const },
    tool_registry: { tools: [VALID_TOOL] },
    concurrency_limit: 3,
    vm_size: null,
    worker_env: null,
    platform_rules_override: null,
    estimated_manual_minutes: null,
    overview: {
      role: 'assistant',
      trigger: 'manual',
      workflow: [],
      tools_used: '',
      output: '',
      approval: '',
    },
    ...overrides,
  };
}

function makeApp(prismaOverrides: Record<string, unknown> = {}) {
  const app = express();
  app.use(express.json());
  app.use(
    adminArchetypeProposeEditRoutes({
      callLLM: vi.fn() as never,
      prisma: prismaOverrides as never,
    }),
  );
  return app;
}

function makePrisma(archetype: ReturnType<typeof makeArchetype> | null = makeArchetype()) {
  return {
    archetype: {
      findFirst: vi.fn().mockResolvedValue(archetype),
    },
    modelCatalog: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

describe('POST /admin/tenants/:tenantId/archetypes/:archetypeId/propose-edit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('200 — allowlist strips model/temperature/role_name from refine result', async () => {
    const prisma = makePrisma();
    mockRefine.mockResolvedValue(makeRefineResult());
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ request_text: 'make replies shorter and friendlier' });

    expect(res.status).toBe(200);
    const proposal = res.body.proposal as Record<string, unknown>;
    expect(proposal).not.toHaveProperty('model');
    expect(proposal).not.toHaveProperty('temperature');
    expect(proposal).not.toHaveProperty('role_name');
    expect(proposal).not.toHaveProperty('concurrency_limit');
    expect(proposal).not.toHaveProperty('vm_size');
    expect(proposal).not.toHaveProperty('estimated_manual_minutes');
    expect(proposal).toHaveProperty('identity');
    expect(proposal).toHaveProperty('execution_steps');
    expect(proposal).toHaveProperty('tool_registry');
  });

  it('200 — changed_fields tracks identity change', async () => {
    const prisma = makePrisma();
    mockRefine.mockResolvedValue(makeRefineResult({ identity: 'A completely new persona' }));
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ request_text: 'change persona' });

    expect(res.status).toBe(200);
    expect(res.body.changed_fields).toHaveProperty('identity');
    expect(res.body.changed_fields.identity).toMatchObject({
      before: 'You are a helpful assistant.',
      after: 'A completely new persona',
    });
  });

  it('200 — no_change true when nothing differs', async () => {
    const archetype = makeArchetype();
    const prisma = makePrisma(archetype);
    mockRefine.mockResolvedValue(
      makeRefineResult({
        identity: archetype.identity,
        execution_steps: archetype.execution_steps,
        tool_registry: archetype.tool_registry,
        trigger_sources: archetype.trigger_sources,
      }),
    );
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ request_text: 'no changes please' });

    expect(res.status).toBe(200);
    expect(res.body.no_change).toBe(true);
    expect(res.body.changed_fields).toEqual({});
  });

  it('422 — empty identity rejected when baseline is non-empty', async () => {
    const prisma = makePrisma();
    mockRefine.mockResolvedValue(makeRefineResult({ identity: '' }));
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ request_text: 'wipe the identity' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('PROPOSAL_INVALID');
    const errors = res.body.errors as Array<{ field: string; reason: string }>;
    expect(errors.some((e) => e.field === 'identity')).toBe(true);
  });

  it('422 — unavailable tool rejected with plain-language reason', async () => {
    const prisma = makePrisma();
    mockRefine.mockResolvedValue(
      makeRefineResult({ tool_registry: { tools: ['/tools/nonexistent/tool.ts'] } }),
    );
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ request_text: 'add a broken tool' });

    expect(res.status).toBe(422);
    const errors = res.body.errors as Array<{ field: string; reason: string }>;
    expect(errors.some((e) => e.reason.includes('/tools/nonexistent/tool.ts'))).toBe(true);
  });

  it('200 — tool_delta computed (added/removed)', async () => {
    const prisma = makePrisma(
      makeArchetype({ tool_registry: { tools: ['/tools/platform/submit-output.ts'] } }),
    );
    mockRefine.mockResolvedValue(
      makeRefineResult({
        tool_registry: {
          tools: ['/tools/platform/submit-output.ts', '/tools/slack/post-message.ts'],
        },
      }),
    );
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ request_text: 'add slack posting' });

    expect(res.status).toBe(200);
    expect(res.body.tool_delta).toMatchObject({
      added: ['/tools/slack/post-message.ts'],
      removed: [],
    });
  });

  it('200 — approval_warning true when approval_required goes from true to false', async () => {
    const prisma = makePrisma(
      makeArchetype({ risk_model: { approval_required: true, timeout_hours: 2 } }),
    );
    mockRefine.mockResolvedValue(
      makeRefineResult({ risk_model: { approval_required: false, timeout_hours: 2 } }),
    );
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ request_text: 'turn off approval' });

    expect(res.status).toBe(200);
    expect(res.body.approval_warning).toBe(true);
  });

  it('422 — invalid trigger_sources rejected with plain-language reason', async () => {
    const prisma = makePrisma(makeArchetype({ trigger_sources: { type: 'manual' } }));
    mockRefine.mockResolvedValue(makeRefineResult({ trigger_sources: { type: 'scheduled' } }));
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ request_text: 'make it scheduled but omit cron' });

    expect(res.status).toBe(422);
    const errors = res.body.errors as Array<{ field: string; reason: string }>;
    expect(errors.some((e) => e.field === 'trigger_sources')).toBe(true);
  });

  it('200 — valid trigger_sources passes with trigger_change summary', async () => {
    const prisma = makePrisma(makeArchetype({ trigger_sources: { type: 'manual' } }));
    mockRefine.mockResolvedValue(
      makeRefineResult({
        trigger_sources: { type: 'scheduled', cron: '0 8 * * 1-5', timezone: 'America/New_York' },
      }),
    );
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ request_text: 'run on weekday mornings' });

    expect(res.status).toBe(200);
    expect(res.body.trigger_change).toMatchObject({
      before: 'Manual trigger',
      after: 'Scheduled: 0 8 * * 1-5 (America/New_York)',
    });
  });

  it('422 — invalid input_schema rejected', async () => {
    const prisma = makePrisma(makeArchetype({ input_schema: null }));
    mockRefine.mockResolvedValue(
      makeRefineResult({
        input_schema: [
          { key: 'INVALID KEY', label: 'x', type: 'text', frequency: 'once', required: true },
        ],
      }),
    );
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ request_text: 'add an input with a bad key' });

    expect(res.status).toBe(422);
    const errors = res.body.errors as Array<{ field: string; reason: string }>;
    expect(errors.some((e) => e.field === 'input_schema')).toBe(true);
  });

  it('200 — valid input_schema passes with input_change summary', async () => {
    const prisma = makePrisma(makeArchetype({ input_schema: null }));
    mockRefine.mockResolvedValue(
      makeRefineResult({
        input_schema: [
          {
            key: 'report_date',
            label: 'Report Date',
            type: 'date',
            frequency: 'every_run',
            required: true,
          },
        ],
      }),
    );
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ request_text: 'add a report date input' });

    expect(res.status).toBe(200);
    expect(res.body.input_change).toMatchObject({
      added: ['report_date'],
      removed: [],
    });
  });

  it('404 — archetype not found', async () => {
    const prisma = makePrisma(null);
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ request_text: 'anything' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('400 — empty request_text rejected', async () => {
    const prisma = makePrisma();
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ request_text: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
  });

  it('400 — missing request_text rejected', async () => {
    const prisma = makePrisma();
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
  });

  it('200 — risk_model in proposal contains only approval_required (no timeout_hours)', async () => {
    const prisma = makePrisma();
    mockRefine.mockResolvedValue(makeRefineResult());
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ request_text: 'minor tweak' });

    expect(res.status).toBe(200);
    const riskModel = res.body.proposal.risk_model as Record<string, unknown>;
    expect(riskModel).toHaveProperty('approval_required');
    expect(riskModel).not.toHaveProperty('timeout_hours');
  });
});
