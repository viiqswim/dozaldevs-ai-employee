import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { InngestLike } from '../../../src/gateway/server.js';
import { dispatchEmployee } from '../../../src/gateway/services/employee-dispatcher.js';

function makeInngest(): InngestLike {
  return {
    send: vi.fn().mockResolvedValue({ ids: ['mock-event-id'] }),
  };
}

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ARCHETYPE_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function makeArchetype(runtime: string) {
  return {
    id: ARCHETYPE_ID,
    role_name: 'daily-summarizer',
    runtime,
    tenant_id: TENANT_ID,
    department_id: null,
    trigger_sources: null,
    tool_registry: null,
    risk_model: null,
    concurrency_limit: 3,
    agent_version_id: null,
    created_at: new Date(),
    system_prompt: null,
    steps: null,
    model: null,
    deliverable_type: null,
  };
}

function makeTask(taskId = 'task-uuid-1234') {
  return {
    id: taskId,
    archetype_id: ARCHETYPE_ID,
    external_id: 'manual-some-uuid',
    source_system: 'manual',
    status: 'Ready',
    tenant_id: TENANT_ID,
    project_id: null,
    requirements: null,
    scope_estimate: null,
    affected_resources: null,
    raw_event: null,
    dispatch_attempts: 0,
    failure_reason: null,
    triage_result: null,
    planContent: null,
    planGeneratedAt: null,
    costUsdCents: 0,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function makePrisma(archetype: ReturnType<typeof makeArchetype> | null, task = makeTask()) {
  return {
    archetype: {
      findUnique: vi.fn().mockResolvedValue(archetype),
    },
    task: {
      create: vi.fn().mockResolvedValue(task),
    },
  };
}

describe('dispatchEmployee', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy path: dispatches task and fires Inngest event', async () => {
    const archetype = makeArchetype('generic-harness');
    const task = makeTask('task-happy-uuid');
    const prisma = makePrisma(archetype, task);
    const inngest = makeInngest();

    const result = await dispatchEmployee({
      tenantId: TENANT_ID,
      slug: 'daily-summarizer',
      dryRun: false,
      prisma: prisma as never,
      inngest,
    });

    expect(result.kind).toBe('dispatched');
    if (result.kind !== 'dispatched') return;

    expect(result.taskId).toBe('task-happy-uuid');
    expect(result.archetypeId).toBe(ARCHETYPE_ID);

    expect(prisma.task.create).toHaveBeenCalledOnce();
    const createArg = (prisma.task.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createArg.data.source_system).toBe('manual');
    expect(createArg.data.status).toBe('Ready');
    expect(createArg.data.archetype_id).toBe(ARCHETYPE_ID);
    expect(createArg.data.tenant_id).toBe(TENANT_ID);

    expect(inngest.send).toHaveBeenCalledOnce();
    const sendArg = (inngest.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sendArg.name).toBe('employee/task.dispatched');
    expect(sendArg.data.taskId).toBe('task-happy-uuid');
    expect(sendArg.data.archetypeId).toBe(ARCHETYPE_ID);
  });

  it('dry-run: returns dry_run result with no side effects', async () => {
    const archetype = makeArchetype('generic-harness');
    const prisma = makePrisma(archetype);
    const inngest = makeInngest();

    const result = await dispatchEmployee({
      tenantId: TENANT_ID,
      slug: 'daily-summarizer',
      dryRun: true,
      prisma: prisma as never,
      inngest,
    });

    expect(result.kind).toBe('dry_run');
    if (result.kind !== 'dry_run') return;

    expect(result.archetypeId).toBe(ARCHETYPE_ID);
    expect(result.wouldFire.eventName).toBe('employee/task.dispatched');
    expect(result.wouldFire.data.archetypeId).toBe(ARCHETYPE_ID);
    expect(typeof result.wouldFire.externalId).toBe('string');
    expect(result.wouldFire.externalId).toMatch(/^manual-/);

    expect(inngest.send).not.toHaveBeenCalled();
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('archetype not found: returns ARCHETYPE_NOT_FOUND error with no side effects', async () => {
    const prisma = makePrisma(null);
    const inngest = makeInngest();

    const result = await dispatchEmployee({
      tenantId: TENANT_ID,
      slug: 'nonexistent-slug',
      dryRun: false,
      prisma: prisma as never,
      inngest,
    });

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;

    expect(result.code).toBe('ARCHETYPE_NOT_FOUND');
    expect(result.message).toContain(TENANT_ID);
    expect(result.message).toContain('nonexistent-slug');

    expect(inngest.send).not.toHaveBeenCalled();
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('unsupported runtime: returns UNSUPPORTED_RUNTIME error with no side effects', async () => {
    const archetype = makeArchetype('opencode');
    const prisma = makePrisma(archetype);
    const inngest = makeInngest();

    const result = await dispatchEmployee({
      tenantId: TENANT_ID,
      slug: 'daily-summarizer',
      dryRun: false,
      prisma: prisma as never,
      inngest,
    });

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;

    expect(result.code).toBe('UNSUPPORTED_RUNTIME');
    expect(result.message).toContain('opencode');

    expect(inngest.send).not.toHaveBeenCalled();
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('generates unique externalId on each call', async () => {
    const archetype = makeArchetype('generic-harness');
    const prisma1 = makePrisma(archetype, makeTask('t1'));
    const prisma2 = makePrisma(archetype, makeTask('t2'));
    const inngest1 = makeInngest();
    const inngest2 = makeInngest();

    const r1 = await dispatchEmployee({
      tenantId: TENANT_ID,
      slug: 'daily-summarizer',
      dryRun: false,
      prisma: prisma1 as never,
      inngest: inngest1,
    });

    const r2 = await dispatchEmployee({
      tenantId: TENANT_ID,
      slug: 'daily-summarizer',
      dryRun: false,
      prisma: prisma2 as never,
      inngest: inngest2,
    });

    if (r1.kind !== 'dispatched' || r2.kind !== 'dispatched') {
      throw new Error('Expected both dispatched');
    }

    const createData1 = (prisma1.task.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    const createData2 = (prisma2.task.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;

    expect(createData1.external_id as string).toMatch(/^manual-/);
    expect(createData2.external_id as string).toMatch(/^manual-/);
    expect(createData1.external_id).not.toBe(createData2.external_id);
  });
});
