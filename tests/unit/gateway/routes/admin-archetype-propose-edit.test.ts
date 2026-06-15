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

const mockConverse = vi.fn();
vi.mock('../../../../src/gateway/services/archetype-generator.js', () => ({
  ArchetypeGenerator: vi.fn().mockImplementation(() => ({
    converse: mockConverse,
  })),
}));

const TENANT = '11111111-1111-4111-8111-111111111111';
const ARCHETYPE_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';
const VALID_TOOL = '/tools/platform/submit-output.ts';
const TRANSCRIPT = [{ role: 'user' as const, content: 'make replies shorter' }];

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

function makeProposalConfig(overrides: Record<string, unknown> = {}) {
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

function makeBaseline() {
  return makeProposalConfig({
    identity: 'You are a helpful assistant.',
    execution_steps: 'Do the task.',
  });
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

  it('200 — question kind returns {kind, question}, no proposal pipeline runs', async () => {
    const prisma = makePrisma();
    mockConverse.mockResolvedValue({ kind: 'question', question: 'What tone should I use?' });
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ transcript: TRANSCRIPT });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ kind: 'question', question: 'What tone should I use?' });
  });

  it('200 — too_long kind returns {kind:too_long}', async () => {
    const prisma = makePrisma();
    mockConverse.mockResolvedValue({ kind: 'too_long' });
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ transcript: TRANSCRIPT });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ kind: 'too_long' });
  });

  it('200 — no_change kind from converse returns {kind:no_change}', async () => {
    const prisma = makePrisma();
    mockConverse.mockResolvedValue({ kind: 'no_change' });
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ transcript: TRANSCRIPT });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ kind: 'no_change' });
  });

  it('200 — proposal kind: allowlist strips model/role_name/concurrency_limit from converse proposal', async () => {
    const prisma = makePrisma();
    mockConverse.mockResolvedValue({
      kind: 'proposal',
      baseline: makeBaseline(),
      proposal: makeProposalConfig(),
      changed_fields: {},
    });
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ transcript: TRANSCRIPT });

    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('proposal');
    const proposal = res.body.proposal as Record<string, unknown>;
    expect(proposal).not.toHaveProperty('model');
    expect(proposal).not.toHaveProperty('role_name');
    expect(proposal).not.toHaveProperty('concurrency_limit');
    expect(proposal).not.toHaveProperty('vm_size');
    expect(proposal).not.toHaveProperty('estimated_manual_minutes');
    expect(proposal).toHaveProperty('identity');
    expect(proposal).toHaveProperty('execution_steps');
    expect(proposal).toHaveProperty('tool_registry');
  });

  it('prose-blank returns question kind (not 422) when execution_steps would go blank', async () => {
    const prisma = makePrisma();
    mockConverse.mockResolvedValue({
      kind: 'proposal',
      baseline: makeBaseline(),
      proposal: makeProposalConfig({ execution_steps: '' }),
      changed_fields: {},
    });
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ transcript: TRANSCRIPT });

    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('question');
    expect(res.body.question).toContain('execution_steps');
  });

  it('unknown tool dropped silently — proposal returns 200 (not 422)', async () => {
    const prisma = makePrisma();
    mockConverse.mockResolvedValue({
      kind: 'proposal',
      baseline: makeBaseline(),
      proposal: makeProposalConfig({ tool_registry: { tools: ['/tools/nonexistent/tool.ts'] } }),
      changed_fields: {},
    });
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ transcript: TRANSCRIPT });

    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('proposal');
  });

  it('200 — proposal kind: approval_required true→false sets approval_warning', async () => {
    const prisma = makePrisma(
      makeArchetype({ risk_model: { approval_required: true, timeout_hours: 2 } }),
    );
    mockConverse.mockResolvedValue({
      kind: 'proposal',
      baseline: makeBaseline(),
      proposal: makeProposalConfig({ risk_model: { approval_required: false, timeout_hours: 2 } }),
      changed_fields: {},
    });
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ transcript: TRANSCRIPT });

    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('proposal');
    expect(res.body.approval_warning).toBe(true);
  });

  it('200 — proposal kind: {kind:no_change} when proposal is identical to baseline', async () => {
    const archetype = makeArchetype();
    const prisma = makePrisma(archetype);
    mockConverse.mockResolvedValue({
      kind: 'proposal',
      baseline: makeBaseline(),
      proposal: makeProposalConfig({
        identity: archetype.identity,
        execution_steps: archetype.execution_steps,
        trigger_sources: archetype.trigger_sources,
        tool_registry: archetype.tool_registry,
      }),
      changed_fields: {},
    });
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ transcript: TRANSCRIPT });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ kind: 'no_change' });
  });

  it('200 — proposal kind: changed_fields tracks identity change', async () => {
    const prisma = makePrisma();
    mockConverse.mockResolvedValue({
      kind: 'proposal',
      baseline: makeBaseline(),
      proposal: makeProposalConfig({ identity: 'A completely new persona' }),
      changed_fields: {},
    });
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ transcript: TRANSCRIPT });

    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('proposal');
    expect(res.body.changed_fields).toHaveProperty('identity');
    expect(res.body.changed_fields.identity).toMatchObject({
      before: 'You are a helpful assistant.',
      after: 'A completely new persona',
    });
  });

  it('200 — proposal kind: tool_delta computed (added/removed)', async () => {
    const prisma = makePrisma(
      makeArchetype({ tool_registry: { tools: ['/tools/platform/submit-output.ts'] } }),
    );
    mockConverse.mockResolvedValue({
      kind: 'proposal',
      baseline: makeBaseline(),
      proposal: makeProposalConfig({
        tool_registry: {
          tools: ['/tools/platform/submit-output.ts', '/tools/slack/post-message.ts'],
        },
      }),
      changed_fields: {},
    });
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ transcript: TRANSCRIPT });

    expect(res.status).toBe(200);
    expect(res.body.tool_delta).toMatchObject({
      added: ['/tools/slack/post-message.ts'],
      removed: [],
    });
  });

  it('200 — proposal kind: trigger_change summary in response', async () => {
    const prisma = makePrisma(makeArchetype({ trigger_sources: { type: 'manual' } }));
    mockConverse.mockResolvedValue({
      kind: 'proposal',
      baseline: makeBaseline(),
      proposal: makeProposalConfig({
        trigger_sources: { type: 'scheduled', cron: '0 8 * * 1-5', timezone: 'America/New_York' },
      }),
      changed_fields: {},
    });
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ transcript: TRANSCRIPT });

    expect(res.status).toBe(200);
    expect(res.body.trigger_change).toMatchObject({
      before: 'Manual trigger',
      after: 'Scheduled: 0 8 * * 1-5 (America/New_York)',
    });
  });

  it('invalid trigger_sources coerced silently — proposal returns 200 (not 422)', async () => {
    const prisma = makePrisma(makeArchetype({ trigger_sources: { type: 'manual' } }));
    mockConverse.mockResolvedValue({
      kind: 'proposal',
      baseline: makeBaseline(),
      proposal: makeProposalConfig({ trigger_sources: { type: 'scheduled' } }),
      changed_fields: {},
    });
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ transcript: TRANSCRIPT });

    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('proposal');
  });

  it('200 — proposal kind: risk_model in response contains only approval_required', async () => {
    const prisma = makePrisma();
    mockConverse.mockResolvedValue({
      kind: 'proposal',
      baseline: makeBaseline(),
      proposal: makeProposalConfig(),
      changed_fields: {},
    });
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ transcript: TRANSCRIPT });

    expect(res.status).toBe(200);
    const riskModel = res.body.proposal?.risk_model as Record<string, unknown>;
    expect(riskModel).toHaveProperty('approval_required');
    expect(riskModel).not.toHaveProperty('timeout_hours');
  });

  it('404 — archetype not found', async () => {
    const prisma = makePrisma(null);
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ transcript: TRANSCRIPT });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('400 — empty transcript rejected', async () => {
    const prisma = makePrisma();
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ transcript: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
  });

  it('400 — missing transcript rejected', async () => {
    const prisma = makePrisma();
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
  });

  it('400 — old request_text body shape rejected', async () => {
    const prisma = makePrisma();
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/${ARCHETYPE_ID}/propose-edit`)
      .send({ request_text: 'make replies shorter' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
  });
});
