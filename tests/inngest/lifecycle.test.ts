import { describe, it, expect, afterEach, afterAll, vi, beforeEach } from 'vitest';
import { Inngest } from 'inngest';
import { InngestTestEngine, mockCtx } from '@inngest/test';
import { getPrisma, cleanupTestData, disconnectPrisma } from '../setup.js';
import { createLifecycleFunction } from '../../src/inngest/lifecycle.js';
import { createMachine, destroyMachine } from '../../src/lib/fly-client.js';
import type { SlackClient } from '../../src/lib/slack-client.js';

vi.mock('../../src/lib/fly-client.js', () => ({
  createMachine: vi.fn(),
  destroyMachine: vi.fn(),
}));

const SEED_PROJECT_ID = '00000000-0000-0000-0000-000000000003';
const SEED_TENANT_ID = '00000000-0000-0000-0000-000000000001';

const inngest = new Inngest({ id: 'ai-employee-test' });

function createMockSlackClient(): SlackClient {
  const postMessage = vi.fn().mockResolvedValue({});
  return {
    postMessage,
  };
}

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

function makeEvent(taskId: string): [{ name: string; data: Record<string, unknown> }] {
  return [{ name: 'engineering/task.received', data: { taskId, projectId: SEED_PROJECT_ID } }];
}

type MockCalls = { mock: { calls: Array<[string, ...unknown[]]> } };

function getStepRunCalls(ctx: { step: { run: unknown } }): Array<[string, ...unknown[]]> {
  return (ctx.step.run as unknown as MockCalls).mock.calls;
}

function makeEngine() {
  return new InngestTestEngine({
    function: createLifecycleFunction(inngest, getPrisma(), createMockSlackClient()),
  });
}

function makeEngineTimeout(noopFinalize = false) {
  return new InngestTestEngine({
    function: createLifecycleFunction(inngest, getPrisma(), createMockSlackClient()),
    transformCtx: (ctx: any) => {
      const origStepRun = ctx.step.run;
      const mocked = mockCtx(ctx);
      mocked.step.waitForEvent = vi.fn().mockResolvedValue(null);
      if (noopFinalize) {
        mocked.step.run = vi
          .fn()
          .mockImplementation(async (id: string, fn: () => Promise<unknown>) => {
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
    function: createLifecycleFunction(inngest, getPrisma(), createMockSlackClient()),
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

function makeEngineCompletion(taskId: string, executionId: string, prUrl: string | null) {
  return new InngestTestEngine({
    function: createLifecycleFunction(inngest, getPrisma(), createMockSlackClient()),
    transformCtx: (ctx: any) => {
      const mocked = mockCtx(ctx);
      mocked.step.waitForEvent = vi.fn().mockResolvedValue({
        name: 'engineering/task.completed',
        data: { taskId, executionId, prUrl },
      });
      return mocked as any;
    },
  });
}

function makeEngineCompletionWithPreFinalize(
  taskId: string,
  executionId: string,
  prUrl: string | null,
  preFinalize: () => Promise<void>,
) {
  return new InngestTestEngine({
    function: createLifecycleFunction(inngest, getPrisma(), createMockSlackClient()),
    transformCtx: (ctx: any) => {
      const origStepRun = ctx.step.run;
      const mocked = mockCtx(ctx);
      mocked.step.waitForEvent = vi.fn().mockResolvedValue({
        name: 'engineering/task.completed',
        data: { taskId, executionId, prUrl },
      });
      mocked.step.run = vi
        .fn()
        .mockImplementation(async (id: string, fn: () => Promise<unknown>) => {
          if (id === 'finalize') {
            await preFinalize();
            return fn();
          }
          return origStepRun(id, fn);
        });
      return mocked as any;
    },
  });
}

async function createTestExecution(taskId: string) {
  return getPrisma().execution.create({
    data: {
      task_id: taskId,
      status: 'completed',
    },
  });
}

function makeEngineForCancellation(cancelledResult: boolean) {
  return new InngestTestEngine({
    function: createLifecycleFunction(inngest, getPrisma(), createMockSlackClient()),
    transformCtx: (ctx: any) => {
      const origStepRun = ctx.step.run;
      const mocked = mockCtx(ctx);
      mocked.step.run = vi
        .fn()
        .mockImplementation(async (id: string, fn: () => Promise<unknown>) => {
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
    function: createLifecycleFunction(inngest, getPrisma(), createMockSlackClient()),
    transformCtx: (ctx: any) => {
      const origStepRun = ctx.step.run;
      const mocked = mockCtx(ctx);
      mocked.step.waitForEvent = vi.fn().mockResolvedValue(null);
      mocked.step.run = vi
        .fn()
        .mockImplementation(async (id: string, fn: () => Promise<unknown>) => {
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
  vi.clearAllMocks();
  process.env.FLY_API_TOKEN = 'test-fly-token';
  process.env.FLY_WORKER_APP = 'test-worker-app';
  vi.mocked(createMachine).mockResolvedValue({ id: 'test-machine-id', state: 'started' });
  vi.mocked(destroyMachine).mockResolvedValue(undefined);
  vi.spyOn(
    inngest as unknown as { send: (...args: unknown[]) => unknown },
    'send',
  ).mockResolvedValue({ ids: [] });
});

afterEach(async () => {
  delete process.env.FLY_API_TOKEN;
  delete process.env.FLY_WORKER_APP;
  delete process.env.FLY_WORKER_IMAGE;
  delete process.env.COST_LIMIT_USD_PER_DEPT_PER_DAY;
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

describe('Group 3 — Machine Dispatch (step: dispatch-fly-machine)', () => {
  it('calls createMachine and stores machine ID in execution record', async () => {
    const task = await createTestTask({ status: 'Ready' });
    const execution = await getPrisma().execution.create({
      data: { task_id: task.id, status: 'pending' },
    });
    const { engine } = makeEngineForDispatch();

    const { error } = await engine.execute({ events: makeEvent(task.id) });

    expect(error).toBeUndefined();
    expect(vi.mocked(createMachine)).toHaveBeenCalledWith(
      'test-worker-app',
      expect.objectContaining({
        image: 'registry.fly.io/ai-employee-workers:latest',
        vm_size: 'performance-2x',
        auto_destroy: true,
        env: expect.objectContaining({ TASK_ID: task.id }),
      }),
    );
    const updated = await getPrisma().execution.findUnique({ where: { id: execution.id } });
    expect(updated!.runtime_id).toBe('test-machine-id');
  });

  it('missing FLY_API_TOKEN → NonRetriableError, task status AwaitingInput with failure reason', async () => {
    delete process.env.FLY_API_TOKEN;
    const task = await createTestTask({ status: 'Ready' });
    const { engine } = makeEngineForDispatch();

    const { error } = await engine.execute({ events: makeEvent(task.id) });

    expect(error).toBeDefined();
    expect((error as Error).message).toContain('FLY_API_TOKEN and FLY_WORKER_APP not configured');
    const updated = await getPrisma().task.findUnique({ where: { id: task.id } });
    expect(updated!.status).toBe('AwaitingInput');
    expect(updated!.failure_reason).toContain('FLY_API_TOKEN');
  });

  it('uses FLY_WORKER_IMAGE env var for machine image when set', async () => {
    process.env.FLY_WORKER_IMAGE = 'custom-registry/workers:v2';
    const task = await createTestTask({ status: 'Ready' });
    const { engine } = makeEngineForDispatch();

    const { error } = await engine.execute({ events: makeEvent(task.id) });

    expect(error).toBeUndefined();
    expect(vi.mocked(createMachine)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ image: 'custom-registry/workers:v2' }),
    );
  });

  it('uses FLY_WORKER_APP env var as app name', async () => {
    process.env.FLY_WORKER_APP = 'my-custom-app';
    const task = await createTestTask({ status: 'Ready' });
    const { engine } = makeEngineForDispatch();

    const { error } = await engine.execute({ events: makeEvent(task.id) });

    expect(error).toBeUndefined();
    expect(vi.mocked(createMachine)).toHaveBeenCalledWith('my-custom-app', expect.any(Object));
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
    const sentEvent = (sendCalls[0] as unknown as [{ name: string }])[0];
    expect(sentEvent.name).toBe('engineering/task.redispatch');
  });

  it('timeout, dispatch_attempts=3 → sets AwaitingInput, writes failure_reason, logs', async () => {
    const task = await createTestTask({ status: 'Ready', dispatch_attempts: 3 });

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
  });

  it('timeout, dispatch_attempts=3 → calls slackClient.postMessage with task failure alert', async () => {
    const task = await createTestTask({ status: 'Ready', dispatch_attempts: 3 });
    const slackClient = createMockSlackClient();
    const engine = new InngestTestEngine({
      function: createLifecycleFunction(inngest, getPrisma(), slackClient),
      transformCtx: (ctx: any) => {
        const mocked = mockCtx(ctx);
        mocked.step.waitForEvent = vi.fn().mockResolvedValue(null);
        return mocked as any;
      },
    });

    const { error } = await engine.execute({ events: makeEvent(task.id) });

    expect(error).toBeUndefined();
    expect(slackClient.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining(task.id),
      }),
    );
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

describe('Group 5 — Phase 6: Finalize Completion Path', () => {
  it('finalize creates deliverable record with PR URL on completion', async () => {
    const task = await createTestTask({ status: 'Ready' });
    const execution = await createTestExecution(task.id);
    const prUrl = 'https://github.com/org/repo/pull/42';

    const { error } = await makeEngineCompletion(task.id, execution.id, prUrl).execute({
      events: makeEvent(task.id),
    });

    expect(error).toBeUndefined();

    const deliverable = await getPrisma().deliverable.findFirst({
      where: { execution_id: execution.id },
    });
    expect(deliverable).not.toBeNull();
    expect(deliverable!.delivery_type).toBe('pull_request');
    expect(deliverable!.external_ref).toBe(prUrl);
    expect(deliverable!.status).toBe('submitted');
  });

  it('finalize creates deliverable with delivery_type no_changes when prUrl is null', async () => {
    const task = await createTestTask({ status: 'Ready' });
    const execution = await createTestExecution(task.id);

    const { error } = await makeEngineCompletion(task.id, execution.id, null).execute({
      events: makeEvent(task.id),
    });

    expect(error).toBeUndefined();

    const deliverable = await getPrisma().deliverable.findFirst({
      where: { execution_id: execution.id },
    });
    expect(deliverable).not.toBeNull();
    expect(deliverable!.delivery_type).toBe('no_changes');
    expect(deliverable!.external_ref).toBeNull();
  });

  it('finalize transitions task from Submitting to Done (optimistic lock)', async () => {
    const task = await createTestTask({ status: 'Ready' });
    const execution = await createTestExecution(task.id);

    const { error } = await makeEngineCompletionWithPreFinalize(
      task.id,
      execution.id,
      null,
      async () => {
        await getPrisma().task.updateMany({
          where: { id: task.id },
          data: { status: 'Submitting' },
        });
      },
    ).execute({ events: makeEvent(task.id) });

    expect(error).toBeUndefined();

    const updated = await getPrisma().task.findUnique({ where: { id: task.id } });
    expect(updated!.status).toBe('Done');
  });

  it('finalize writes status log entry (actor: lifecycle_fn, to_status: Done)', async () => {
    const task = await createTestTask({ status: 'Ready' });
    const execution = await createTestExecution(task.id);

    const { error } = await makeEngineCompletion(task.id, execution.id, null).execute({
      events: makeEvent(task.id),
    });

    expect(error).toBeUndefined();

    const log = await getPrisma().taskStatusLog.findFirst({
      where: { task_id: task.id, to_status: 'Done', actor: 'lifecycle_fn' },
    });
    expect(log).not.toBeNull();
    expect(log!.actor).toBe('lifecycle_fn');
    expect(log!.to_status).toBe('Done');
  });

  it('finalize skips update when task already Done (idempotent)', async () => {
    const task = await createTestTask({ status: 'Ready' });
    const execution = await createTestExecution(task.id);

    const { error } = await makeEngineCompletionWithPreFinalize(
      task.id,
      execution.id,
      null,
      async () => {
        await getPrisma().task.updateMany({
          where: { id: task.id },
          data: { status: 'Done' },
        });
      },
    ).execute({ events: makeEvent(task.id) });

    expect(error).toBeUndefined();

    const doneLogs = await getPrisma().taskStatusLog.findMany({
      where: { task_id: task.id, to_status: 'Done' },
    });
    expect(doneLogs).toHaveLength(0);
  });

  it('finalize skips update when task Cancelled', async () => {
    const task = await createTestTask({ status: 'Ready' });
    const execution = await createTestExecution(task.id);

    const { error } = await makeEngineCompletionWithPreFinalize(
      task.id,
      execution.id,
      null,
      async () => {
        await getPrisma().task.updateMany({
          where: { id: task.id },
          data: { status: 'Cancelled' },
        });
      },
    ).execute({ events: makeEvent(task.id) });

    expect(error).toBeUndefined();

    const updated = await getPrisma().task.findUnique({ where: { id: task.id } });
    expect(updated!.status).toBe('Cancelled');

    const doneLogs = await getPrisma().taskStatusLog.findMany({
      where: { task_id: task.id, to_status: 'Done' },
    });
    expect(doneLogs).toHaveLength(0);
  });

  it('finalize timeout branch still runs unchanged (re-dispatch logic)', async () => {
    const task = await createTestTask({ status: 'Ready', dispatch_attempts: 0 });

    const { error } = await makeEngineTimeout().execute({ events: makeEvent(task.id) });

    expect(error).toBeUndefined();

    const updated = await getPrisma().task.findUnique({ where: { id: task.id } });
    expect(updated!.status).toBe('Ready');
    expect(updated!.dispatch_attempts).toBe(1);
  });

  it('timeout path: destroyMachine called with correct app name and machine ID', async () => {
    const task = await createTestTask({ status: 'Ready', dispatch_attempts: 0 });

    const { error } = await makeEngineTimeout().execute({ events: makeEvent(task.id) });

    expect(error).toBeUndefined();
    expect(vi.mocked(destroyMachine)).toHaveBeenCalledWith('test-worker-app', 'test-machine-id');
  });

  it('completion path: destroyMachine called as backup cleanup', async () => {
    const task = await createTestTask({ status: 'Ready' });
    const execution = await createTestExecution(task.id);

    const { error } = await makeEngineCompletion(task.id, execution.id, null).execute({
      events: makeEvent(task.id),
    });

    expect(error).toBeUndefined();
    expect(vi.mocked(destroyMachine)).toHaveBeenCalledWith('test-worker-app', 'test-machine-id');
  });

  it('destroyMachine throwing error does not break lifecycle (non-fatal)', async () => {
    const task = await createTestTask({ status: 'Ready', dispatch_attempts: 0 });
    vi.mocked(destroyMachine).mockRejectedValueOnce(new Error('Fly.io API error'));

    const { error } = await makeEngineTimeout().execute({ events: makeEvent(task.id) });

    expect(error).toBeUndefined();
    const updated = await getPrisma().task.findUnique({ where: { id: task.id } });
    expect(updated!.status).toBe('Ready');
    expect(updated!.dispatch_attempts).toBe(1);
  });
});

describe('Group 6 — Cost Gate (step: check-cost-gate)', () => {
  it('over-threshold: sets task to AwaitingInput with failure_reason, writes log, skips dispatch', async () => {
    const expensiveTask = await createTestTask();
    await getPrisma().execution.create({
      data: {
        task_id: expensiveTask.id,
        status: 'completed',
        estimated_cost_usd: 100,
      },
    });
    process.env.COST_LIMIT_USD_PER_DEPT_PER_DAY = '50';

    const task = await createTestTask({ status: 'Ready' });

    const { error } = await makeEngine().execute({ events: makeEvent(task.id) });

    expect(error).toBeUndefined();

    const updated = await getPrisma().task.findUnique({ where: { id: task.id } });
    expect(updated!.status).toBe('AwaitingInput');
    expect(updated!.failure_reason).toContain('Daily cost limit');
    expect(updated!.failure_reason).toContain('$50.00');

    const log = await getPrisma().taskStatusLog.findFirst({
      where: { task_id: task.id, to_status: 'AwaitingInput', actor: 'lifecycle_fn' },
    });
    expect(log).not.toBeNull();
    expect(log!.from_status).toBe('Executing');

    expect(vi.mocked(createMachine)).not.toHaveBeenCalled();
  });

  it('under-threshold: cost gate passes and dispatch-fly-machine runs normally', async () => {
    process.env.COST_LIMIT_USD_PER_DEPT_PER_DAY = '50';
    const task = await createTestTask({ status: 'Ready' });
    const { engine } = makeEngineForDispatch();

    const { error } = await engine.execute({ events: makeEvent(task.id) });

    expect(error).toBeUndefined();
    expect(vi.mocked(createMachine)).toHaveBeenCalled();
  });
});

describe('Group 7 — Race Condition Pre-Check (step: pre-check-completion)', () => {
  it('pre-check Submitting: skips waitForEvent, finalize runs with synthetic result → task Done', async () => {
    const task = await createTestTask({ status: 'Ready' });
    await createTestExecution(task.id);

    const engine = new InngestTestEngine({
      function: createLifecycleFunction(inngest, getPrisma(), createMockSlackClient()),
      transformCtx: (ctx: any) => {
        const origStepRun = ctx.step.run;
        const mocked = mockCtx(ctx);
        mocked.step.waitForEvent = vi.fn().mockResolvedValue(null);
        mocked.step.run = vi
          .fn()
          .mockImplementation(async (id: string, fn: () => Promise<unknown>) => {
            if (id === 'pre-check-completion') return 'Submitting';
            return origStepRun(id, fn);
          });
        return mocked as any;
      },
    });

    const { ctx, error } = await engine.execute({ events: makeEvent(task.id) });

    expect(error).toBeUndefined();
    expect((ctx.step.waitForEvent as unknown as MockCalls).mock.calls).toHaveLength(0);
    const updated = await getPrisma().task.findUnique({ where: { id: task.id } });
    expect(updated!.status).toBe('Done');
  });

  it('pre-check Done: lifecycle returns early, waitForEvent and finalize not called', async () => {
    const task = await createTestTask({ status: 'Ready' });

    const engine = new InngestTestEngine({
      function: createLifecycleFunction(inngest, getPrisma(), createMockSlackClient()),
      transformCtx: (ctx: any) => {
        const origStepRun = ctx.step.run;
        const mocked = mockCtx(ctx);
        mocked.step.waitForEvent = vi.fn().mockResolvedValue(null);
        mocked.step.run = vi
          .fn()
          .mockImplementation(async (id: string, fn: () => Promise<unknown>) => {
            if (id === 'pre-check-completion') return 'Done';
            return origStepRun(id, fn);
          });
        return mocked as any;
      },
    });

    const { ctx, error } = await engine.execute({ events: makeEvent(task.id) });

    expect(error).toBeUndefined();
    expect((ctx.step.waitForEvent as unknown as MockCalls).mock.calls).toHaveLength(0);
    const wasFinalized = getStepRunCalls(ctx).some(([id]) => id === 'finalize');
    expect(wasFinalized).toBe(false);
  });

  it('pre-check Executing: waitForEvent IS called (normal happy path unchanged)', async () => {
    const task = await createTestTask({ status: 'Ready' });

    const engine = new InngestTestEngine({
      function: createLifecycleFunction(inngest, getPrisma(), createMockSlackClient()),
      transformCtx: (ctx: any) => {
        const origStepRun = ctx.step.run;
        const mocked = mockCtx(ctx);
        mocked.step.waitForEvent = vi.fn().mockResolvedValue(null);
        mocked.step.run = vi
          .fn()
          .mockImplementation(async (id: string, fn: () => Promise<unknown>) => {
            if (id === 'finalize') return undefined;
            return origStepRun(id, fn);
          });
        return mocked as any;
      },
    });

    const { ctx, error } = await engine.execute({ events: makeEvent(task.id) });

    expect(error).toBeUndefined();
    const waitCalls = (ctx.step.waitForEvent as unknown as MockCalls).mock.calls;
    expect(waitCalls).toHaveLength(1);
    expect(waitCalls[0][0]).toBe('wait-for-completion');
  });
});
