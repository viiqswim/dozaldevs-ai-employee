import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { adminArchetypeConverseCreateRoutes } from '../../../../src/gateway/routes/admin-archetype-converse-create.js';

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
const VALID_TOOL = '/tools/platform/submit-output.ts';
const TRANSCRIPT = [
  { role: 'user' as const, content: 'I need a bot that posts daily standup reminders' },
];
const AMBIGUOUS_TRANSCRIPT = [{ role: 'user' as const, content: 'I need a bot' }];

function makeProposalConfig(overrides: Record<string, unknown> = {}) {
  return {
    role_name: 'standup-reminder-bot',
    model: 'deepseek/deepseek-v4-flash',
    runtime: 'opencode' as const,
    identity: 'You are StandupBot, a Daily Standup Reminder at AcmeCorp.',
    execution_steps: 'Post a standup reminder to the team channel.',
    delivery_steps: null,
    delivery_instructions: null,
    instructions: 'Run the standup task.',
    deliverable_type: null,
    input_schema: undefined,
    risk_model: { approval_required: false, timeout_hours: 2 },
    trigger_sources: { type: 'manual' as const },
    tool_registry: { tools: [VALID_TOOL] },
    concurrency_limit: 1,
    vm_size: null,
    worker_env: null,
    platform_rules_override: null,
    estimated_manual_minutes: null,
    overview: {
      role: 'standup-reminder-bot',
      trigger: 'manual',
      workflow: ['Post reminder'],
      tools_used: 'slack',
      output: 'Slack message',
      approval: 'none',
    },
    ...overrides,
  };
}

function makePrisma() {
  return {
    modelCatalog: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

function makeApp(prismaOverrides: Record<string, unknown> = {}) {
  const app = express();
  app.use(express.json());
  app.use(
    adminArchetypeConverseCreateRoutes({
      callLLM: vi.fn() as never,
      prisma: prismaOverrides as never,
    }),
  );
  return app;
}

describe('POST /admin/tenants/:tenantId/archetypes/converse-create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('200 — ambiguous transcript: question kind returns {kind, question}', async () => {
    const prisma = makePrisma();
    mockConverse.mockResolvedValue({
      kind: 'question',
      question: 'What is the main purpose of this bot?',
    });
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/converse-create`)
      .send({ transcript: AMBIGUOUS_TRANSCRIPT });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      kind: 'question',
      question: 'What is the main purpose of this bot?',
    });
  });

  it('200 — sufficient transcript: proposal kind returns non-empty identity and execution_steps', async () => {
    const prisma = makePrisma();
    mockConverse.mockResolvedValue({
      kind: 'proposal',
      proposal: makeProposalConfig(),
      changed_fields: {},
    });
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/converse-create`)
      .send({ transcript: TRANSCRIPT });

    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('proposal');
    const proposal = res.body.proposal as Record<string, unknown>;
    expect(typeof proposal.identity).toBe('string');
    expect((proposal.identity as string).length).toBeGreaterThan(0);
    expect(typeof proposal.execution_steps).toBe('string');
    expect((proposal.execution_steps as string).length).toBeGreaterThan(0);
  });

  it('shared impl: ArchetypeGenerator.converse is called (not a duplicate implementation)', async () => {
    const prisma = makePrisma();
    mockConverse.mockResolvedValue({ kind: 'question', question: 'Tell me more.' });
    const app = makeApp(prisma);

    await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/converse-create`)
      .send({ transcript: TRANSCRIPT });

    expect(mockConverse).toHaveBeenCalledOnce();
    expect(mockConverse).toHaveBeenCalledWith(
      TRANSCRIPT,
      expect.objectContaining({ identity: '' }),
      expect.any(Array),
      expect.objectContaining({ connectedToolkits: expect.any(Array) }),
    );
  });

  it('200 — too_long kind returns {kind:too_long}', async () => {
    const prisma = makePrisma();
    mockConverse.mockResolvedValue({ kind: 'too_long' });
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/converse-create`)
      .send({ transcript: TRANSCRIPT });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ kind: 'too_long' });
  });

  it('200 — no_change from converse returns {kind:no_change}', async () => {
    const prisma = makePrisma();
    mockConverse.mockResolvedValue({ kind: 'no_change' });
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/converse-create`)
      .send({ transcript: TRANSCRIPT });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ kind: 'no_change' });
  });

  it('200 — proposal kind: response includes baseline (empty), proposal, changed_fields', async () => {
    const prisma = makePrisma();
    mockConverse.mockResolvedValue({
      kind: 'proposal',
      proposal: makeProposalConfig(),
      changed_fields: {},
    });
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/converse-create`)
      .send({ transcript: TRANSCRIPT });

    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('proposal');
    expect(res.body).toHaveProperty('baseline');
    expect(res.body).toHaveProperty('proposal');
    expect(res.body).toHaveProperty('changed_fields');
    expect(res.body.baseline.identity).toBe('');
    expect(res.body.baseline.execution_steps).toBe('');
  });

  it('200 — proposal kind: deliverable_type and delivery_instructions survive the create allowlist', async () => {
    const prisma = makePrisma();
    mockConverse.mockResolvedValue({
      kind: 'proposal',
      proposal: makeProposalConfig({
        deliverable_type: 'slack_message',
        delivery_instructions: 'Post the summary to the channel.',
      }),
      changed_fields: {},
    });
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/converse-create`)
      .send({ transcript: TRANSCRIPT });

    expect(res.status).toBe(200);
    const proposal = res.body.proposal as Record<string, unknown>;
    expect(proposal.deliverable_type).toBe('slack_message');
    expect(proposal.delivery_instructions).toBe('Post the summary to the channel.');
  });

  it('200 — proposal kind: changed_fields tracks identity change from empty baseline', async () => {
    const prisma = makePrisma();
    mockConverse.mockResolvedValue({
      kind: 'proposal',
      proposal: makeProposalConfig({ identity: 'You are StandupBot.' }),
      changed_fields: {},
    });
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/converse-create`)
      .send({ transcript: TRANSCRIPT });

    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('proposal');
    expect(res.body.changed_fields).toHaveProperty('identity');
    expect(res.body.changed_fields.identity).toMatchObject({
      before: '',
      after: 'You are StandupBot.',
    });
  });

  it('200 — proposal kind: non-editable fields stripped (model/concurrency_limit/vm_size)', async () => {
    const prisma = makePrisma();
    mockConverse.mockResolvedValue({
      kind: 'proposal',
      proposal: makeProposalConfig(),
      changed_fields: {},
    });
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/converse-create`)
      .send({ transcript: TRANSCRIPT });

    expect(res.status).toBe(200);
    const proposal = res.body.proposal as Record<string, unknown>;
    expect(proposal).not.toHaveProperty('concurrency_limit');
    expect(proposal).not.toHaveProperty('vm_size');
    expect(proposal).not.toHaveProperty('estimated_manual_minutes');
    expect(proposal).not.toHaveProperty('worker_env');
    expect(proposal).not.toHaveProperty('platform_rules_override');
    expect(proposal).toHaveProperty('identity');
    expect(proposal).toHaveProperty('execution_steps');
  });

  it('200 — proposal kind: {kind:no_change} when proposal fields are identical to empty baseline', async () => {
    const prisma = makePrisma();
    mockConverse.mockResolvedValue({
      kind: 'proposal',
      proposal: makeProposalConfig({
        identity: '',
        execution_steps: '',
        delivery_steps: null,
        trigger_sources: { type: 'manual' },
        tool_registry: { tools: [] },
        overview: { role: '', trigger: '', workflow: [], tools_used: '', output: '', approval: '' },
      }),
      changed_fields: {},
    });
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/converse-create`)
      .send({ transcript: TRANSCRIPT });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ kind: 'no_change' });
  });

  it('400 — empty transcript rejected', async () => {
    const prisma = makePrisma();
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/converse-create`)
      .send({ transcript: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
  });

  it('400 — missing transcript rejected', async () => {
    const prisma = makePrisma();
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/converse-create`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
  });

  it('unknown tool dropped silently — proposal returns 200 (not 422)', async () => {
    const prisma = makePrisma();
    mockConverse.mockResolvedValue({
      kind: 'proposal',
      proposal: makeProposalConfig({ tool_registry: { tools: ['/tools/nonexistent/tool.ts'] } }),
      changed_fields: {},
    });
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/converse-create`)
      .send({ transcript: TRANSCRIPT });

    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('proposal');
  });

  it('400 — invalid tenantId returns 400', async () => {
    const prisma = makePrisma();
    const app = makeApp(prisma);

    const res = await request(app)
      .post(`/admin/tenants/not-a-uuid/archetypes/converse-create`)
      .send({ transcript: TRANSCRIPT });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_ID');
  });
});
