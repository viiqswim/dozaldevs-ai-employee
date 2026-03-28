import { describe, it, expect, afterEach, afterAll, vi, beforeEach } from 'vitest';
import { Inngest } from 'inngest';
import { InngestTestEngine, mockCtx } from '@inngest/test';
import { getPrisma, cleanupTestData, disconnectPrisma } from '../setup.js';
import { createLifecycleFunction } from '../../src/inngest/lifecycle.js';

const SEED_PROJECT_ID = '00000000-0000-0000-0000-000000000003';
const SEED_TENANT_ID = '00000000-0000-0000-0000-000000000001';

const inngest = new Inngest({ id: 'ai-employee-test' });

async function createTestTask(
  overrides: Partial<{ status: string; dispatch_attempts: number }> = {},
) {
  return getPrisma().task.create({
    data: {
      external_id: `TEST-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      source_system: 'jira',
      status: overrides.status ?? 'Ready',
      dispatch_attempts: overrides.dispatch_attempts ?? 0,
      tenant_id: SEED_TENANT_ID,
      project_id: SEED_PROJECT_ID,
      triage_result: {},
      raw_event: {},
    },
  });
}

function makeEvent(taskId: string) {
  return [{ name: 'engineering/task.received', data: { taskId, projectId: SEED_PROJECT_ID } }];
}

type MockCalls = { mock: { calls: Array<[string, ...unknown[]]> } };

function getStepRunCalls(ctx: { step: { run: unknown } }): Array<[string, ...unknown[]]> {
  return (ctx.step.run as unknown as MockCalls).mock.calls;
}

function makeEngine() {
  return new InngestTestEngine({ function: createLifecycleFunction(inngest, getPrisma()) });
}

function makeEngineTimeout(noopFinalize = false) {
  return new InngestTestEngine({
    function: createLifecycleFunction(inngest, getPrisma()),
    transformCtx: (ctx: any) => {
      const origStepRun = ctx.step.run;
      const mocked = mockCtx(ctx);
      mocked.step.waitForEvent = vi.fn().mockResolvedValue(null);
      if (noopFinalize) {
        mocked.step.run = vi.fn().mockImplementation(async (id: string, fn: () => Promise<unknown>) => {
          if (id === 'finalize') return undefined;
          return origStepRun(id, fn);
        });
      }
      return mocked as any;
    },
  });
}

function makeEngineSuccess() {
  return new InngestTestEngine({
    function: createLifecycleFunction(inngest, getPrisma()),
    transformCtx: (ctx: any) => {
      const mocked = mockCtx(ctx);
      mocked.step.waitForEvent = vi.fn().mockResolvedValue({
        name: 'engineering/task.completed',
        data: { status: 'success' },
      });
      return mocked as any;
    },
  });
}

function makeEngineForCancellation(cancelledResult: boolean) {
  return new InngestTestEngine({
    function: createLifecycleFunction(inngest, getPrisma()),
    transformCtx: (ctx: any) => {
      const origStepRun = ctx.step.run;
      const mocked = mockCtx(ctx);
      mocked.step.run = vi.fn().mockImplementation(async (id: string, fn: () => Promise<unknown>) => {
        if (id === 'check-cancellation') return cancelledResult;
        return origStepRun(id, fn);
      });
      return mocked as any;
    },
  });
}

function makeEngineForDispatch() {
  let dispatchResult: unknown;
  const engine = new InngestTestEngine({
    function: createLifecycleFunction(inngest, getPrisma()),
    transformCtx: (ctx: any) => {
      const origStepRun = ctx.step.run;
      const mocked = mockCtx(ctx);
      mocked.step.waitForEvent = vi.fn().mockResolvedValue(null);
      mocked.step.run = vi.fn().mockImplementation(async (id: string, fn: () => Promise<unknown>) => {
        if (id === 'finalize') return undefined;
        const result = await origStepRun(id, fn);
        if (id === 'dispatch-fly-machine') dispatchResult = result;
        return result;
      });
      return mocked as any;
    },
  });
  return { engine, getDispatchResult: () => dispatchResult };
}

beforeEach(() => {
  vi.spyOn(inngest, 'send' as keyof typeof inngest).mockResolvedValue({ ids: [] } as never);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupTestData();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('Group 1 — Optimistic Locking (step: update-status-executing)', () => {
  it('happy path: Ready task transitions to Executing with status log entry', async () => {
    const task = await createTestTask({ status: 'Ready' });

    const { error } = await makeEngineTimeout(true).execute({ events: makeEvent(task.id) });

    expect(error).toBeUndefined();

    const updated = await getPrisma().task.findUnique({ where: { id: task.id } });
    expect(updated!.status).toBe('Executing');

    const log = await getPrisma().taskStatusLog.findFirst({ where: { task_id: task.id } });
    expect(log).not.toBeNull();
    expect(log!.from_status).toBe('Ready');
    expect(log!.to_status).toBe('Executing');
    expect(log!.actor).toBe('lifecycle_fn');
  });

  it('lock conflict: Executing task → optimistic lock error, no log entry written', async () => {
    const task = await createTestTask({ status: 'Executing' });

    const { error } = await makeEngine().execute({ events: makeEvent(task.id) });

    expect(error).toBeDefined();
    expect((error as Error).message).toContain('optimistic lock failed');

    const logCount = await getPrisma().taskStatusLog.count({ where: { task_id: task.id } });
    expect(logCount).toBe(0);
  });

  it('task not found: non-existent taskId → optimistic lock error', async () => {
    const { error } = await makeEngine().execute({
      events: makeEvent('00000000-dead-beef-dead-000000000000'),
    });

    expect(error).toBeDefined();
    expect((error as Error).message).toContain('optimistic lock failed');
  });

  it('cancellation check: cancelled task returns early, dispatch-fly-machine not called', async () => {
    const task = await createTestTask({ status: 'Ready' });

    const { ctx, error } = await makeEngineForCancellation(true).execute({
      events: makeEvent(task.id),
    });

    expect(error).toBeUndefined();
    const wasDispatched = getStepRunCalls(ctx).some(([id]) => id === 'dispatch-fly-machine');
    expect(wasDispatched).toBe(false);
  });
});

describe('Group 2 — Cancellation Check (step: check-cancellation)', () => {
  it('task still Executing after step 1 → continues to dispatch-fly-machine', async () => {
    const task = await createTestTask({ status: 'Ready' });

    const { ctx, error } = await makeEngineTimeout(true).execute({ events: makeEvent(task.id) });

    expect(error).toBeUndefined();
    const wasDispatched = getStepRunCalls(ctx).some(([id]) => id === 'dispatch-fly-machine');
    expect(wasDispatched).toBe(true);
  });

  it('task cancelled → returns early without dispatch', async () => {
    const task = await createTestTask({ status: 'Ready' });

    const { ctx, error } = await makeEngineForCancellation(true).execute({
      events: makeEvent(task.id),
    });

    expect(error).toBeUndefined();
    const wasDispatched = getStepRunCalls(ctx).some(([id]) => id === 'dispatch-fly-machine');
    expect(wasDispatched).toBe(false);
  });
});

describe('Group 3 — Machine Dispatch Placeholder (step: dispatch-fly-machine)', () => {
  it('returns { id: "placeholder-machine-id" }', async () => {
    const task = await createTestTask({ status: 'Ready' });
    const { engine, getDispatchResult } = makeEngineForDispatch();

    const { error } = await engine.execute({ events: makeEvent(task.id) });

    expect(error).toBeUndefined();
    expect(getDispatchResult()).toEqual({ id: 'placeholder-machine-id' });
  });
});

describe('Group 4 — Finalize (step: finalize)', () => {
  it('timeout, dispatch_attempts=0 → resets to Ready, increments to 1, writes log, emits redispatch', async () => {
    const task = await createTestTask({ status: 'Ready', dispatch_attempts: 0 });

    const { error } = await makeEngineTimeout().execute({ events: makeEvent(task.id) });

    expect(error).toBeUndefined();

    const prisma = getPrisma();
    const updated = await prisma.task.findUnique({ where: { id: task.id } });
    expect(updated!.status).toBe('Ready');
    expect(updated!.dispatch_attempts).toBe(1);

    const log = await prisma.taskStatusLog.findFirst({
      where: { task_id: task.id, to_status: 'Ready', actor: 'lifecycle_fn' },
    });
    expect(log).not.toBeNull();
    expect(log!.from_status).toBe('Executing');

    const sendCalls = (inngest.send as unknown as MockCalls).mock.calls;
    expect(sendCalls.length).toBeGreaterThan(0);
    const sentEvent = (sendCalls[0] as [{ name: string }])[0];
    expect(sentEvent.name).toBe('engineering/task.redispatch');
  });

  it('timeout, dispatch_attempts=3 → sets AwaitingInput, writes failure_reason, logs, warns [SLACK STUB]', async () => {
    const task = await createTestTask({ status: 'Ready', dispatch_attempts: 3 });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { error } = await makeEngineTimeout().execute({ events: makeEvent(task.id) });

    expect(error).toBeUndefined();

    const prisma = getPrisma();
    const updated = await prisma.task.findUnique({ where: { id: task.id } });
    expect(updated!.status).toBe('AwaitingInput');
    expect(updated!.failure_reason).toContain('Exhausted');

    const log = await prisma.taskStatusLog.findFirst({
      where: { task_id: task.id, to_status: 'AwaitingInput', actor: 'lifecycle_fn' },
    });
    expect(log).not.toBeNull();
    expect(log!.from_status).toBe('Executing');

    const warnCalls = warnSpy.mock.calls as unknown as Array<[string, ...unknown[]]>;
    const slackCall = warnCalls.find(([msg]) => typeof msg === 'string' && msg.includes('[SLACK STUB]'));
    expect(slackCall).toBeDefined();
  });

  it('success event received → task confirmed Done', async () => {
    const task = await createTestTask({ status: 'Ready' });

    const { error } = await makeEngineSuccess().execute({ events: makeEvent(task.id) });

    expect(error).toBeUndefined();

    const updated = await getPrisma().task.findUnique({ where: { id: task.id } });
    expect(updated!.status).toBe('Done');
  });

  it('timeout, dispatch_attempts=1 → increments to 2', async () => {
    const task = await createTestTask({ status: 'Ready', dispatch_attempts: 1 });

    const { error } = await makeEngineTimeout().execute({ events: makeEvent(task.id) });

    expect(error).toBeUndefined();

    const updated = await getPrisma().task.findUnique({ where: { id: task.id } });
    expect(updated!.dispatch_attempts).toBe(2);
    expect(updated!.status).toBe('Ready');
  });
});
