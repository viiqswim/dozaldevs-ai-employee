import { describe, it, expect, afterEach, afterAll, beforeEach, vi } from 'vitest';
import { Inngest } from 'inngest';
import { InngestTestEngine, mockCtx } from '@inngest/test';
import { getPrisma, cleanupTestData, disconnectPrisma } from '../setup.js';
import { createRedispatchFunction } from '../../src/inngest/redispatch.js';
import type { SlackClient } from '../../src/lib/slack-client.js';

const SEED_PROJECT_ID = '00000000-0000-0000-0000-000000000003';
const SEED_TENANT_ID = '00000000-0000-0000-0000-000000000002';

const inngest = new Inngest({ id: 'ai-employee-test' });

async function createTestTask(
  overrides: Partial<{ dispatch_attempts: number; created_at: Date }> = {},
) {
  return getPrisma().task.create({
    data: {
      external_id: `TEST-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      source_system: 'jira',
      status: 'Ready',
      dispatch_attempts: overrides.dispatch_attempts ?? 0,
      ...(overrides.created_at ? { created_at: overrides.created_at } : {}),
      tenant_id: SEED_TENANT_ID,
      project_id: SEED_PROJECT_ID,
      triage_result: {},
      raw_event: {},
    },
  });
}

function makeEngine(slackMock: SlackClient, sentEvents: Array<{ name: string; data: unknown }>) {
  return new InngestTestEngine({
    function: createRedispatchFunction(inngest, getPrisma(), slackMock),
    transformCtx: (ctx: any) => {
      const origStepRun = ctx.step.run;
      const mocked = mockCtx(ctx);
      mocked.step.run = vi
        .fn()
        .mockImplementation(async (id: string, fn: () => Promise<unknown>) => {
          return origStepRun(id, fn);
        });
      mocked.step.sendEvent = vi
        .fn()
        .mockImplementation(async (_id: string, event: { name: string; data: unknown }) => {
          sentEvents.push(event);
        });
      return mocked as any;
    },
  });
}

function makeSlackMock(): SlackClient {
  return {
    postMessage: vi.fn().mockResolvedValue({ ts: '1234567890.000100', channel: 'C123' }),
    updateMessage: vi.fn().mockResolvedValue(undefined),
  };
}

function makeRedispatchEvent(
  taskId: string,
  overrides: Record<string, unknown> = {},
): [{ name: string; data: Record<string, unknown> }] {
  return [
    {
      name: 'engineering/task.redispatch',
      data: { taskId, attempt: 1, ...overrides },
    },
  ];
}

beforeEach(() => {
  vi.spyOn(
    inngest as unknown as { send: (...args: unknown[]) => unknown },
    'send',
  ).mockResolvedValue({ ids: [] });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupTestData();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('redispatch function', () => {
  it('function has correct ID: engineering/task-redispatch', () => {
    const fn = createRedispatchFunction(inngest, getPrisma(), makeSlackMock());
    expect((fn as any).opts.id).toBe('engineering/task-redispatch');
  });

  describe('dispatch_attempts >= 3', () => {
    it('sets task to AwaitingInput with correct failure_reason', async () => {
      const task = await createTestTask({ dispatch_attempts: 3 });
      const slack = makeSlackMock();
      const sentEvents: Array<{ name: string; data: unknown }> = [];

      const { error } = await makeEngine(slack, sentEvents).execute({
        events: makeRedispatchEvent(task.id, { attempt: 3 }),
      });

      expect(error).toBeUndefined();

      const updated = await getPrisma().task.findUnique({ where: { id: task.id } });
      expect(updated!.status).toBe('AwaitingInput');
      expect(updated!.failure_reason).toBe('Max dispatch attempts (3) exceeded');
    });

    it('posts Slack alert and does not emit re-dispatch event', async () => {
      const task = await createTestTask({ dispatch_attempts: 3 });
      const slack = makeSlackMock();
      const sentEvents: Array<{ name: string; data: unknown }> = [];

      const { error } = await makeEngine(slack, sentEvents).execute({
        events: makeRedispatchEvent(task.id, { attempt: 3 }),
      });

      expect(error).toBeUndefined();
      expect(slack.postMessage).toHaveBeenCalledOnce();
      expect(sentEvents).toHaveLength(0);
    });
  });

  describe('elapsed > 8h (within attempt limit)', () => {
    it('sets task to AwaitingInput with elapsed-time failure_reason', async () => {
      const nineHoursAgo = new Date(Date.now() - 9 * 60 * 60 * 1000);
      const task = await createTestTask({ dispatch_attempts: 1, created_at: nineHoursAgo });
      const slack = makeSlackMock();
      const sentEvents: Array<{ name: string; data: unknown }> = [];

      const { error } = await makeEngine(slack, sentEvents).execute({
        events: makeRedispatchEvent(task.id, { attempt: 1 }),
      });

      expect(error).toBeUndefined();

      const updated = await getPrisma().task.findUnique({ where: { id: task.id } });
      expect(updated!.status).toBe('AwaitingInput');
      expect(updated!.failure_reason).toContain(
        'Total timeout budget (8h) exceeded after 1 dispatch attempts',
      );
    });

    it('posts Slack alert and does not emit re-dispatch event', async () => {
      const nineHoursAgo = new Date(Date.now() - 9 * 60 * 60 * 1000);
      const task = await createTestTask({ dispatch_attempts: 1, created_at: nineHoursAgo });
      const slack = makeSlackMock();
      const sentEvents: Array<{ name: string; data: unknown }> = [];

      const { error } = await makeEngine(slack, sentEvents).execute({
        events: makeRedispatchEvent(task.id, { attempt: 1 }),
      });

      expect(error).toBeUndefined();
      expect(slack.postMessage).toHaveBeenCalledOnce();
      expect(sentEvents).toHaveLength(0);
    });
  });

  describe('elapsed < 8h AND attempts < 3 (re-dispatch path)', () => {
    it('emits engineering/task.received with taskId and attempt', async () => {
      const task = await createTestTask({ dispatch_attempts: 1 });
      const slack = makeSlackMock();
      const sentEvents: Array<{ name: string; data: unknown }> = [];

      const { error } = await makeEngine(slack, sentEvents).execute({
        events: makeRedispatchEvent(task.id, { attempt: 2 }),
      });

      expect(error).toBeUndefined();
      expect(sentEvents).toHaveLength(1);
      expect(sentEvents[0].name).toBe('engineering/task.received');
      const eventData = sentEvents[0].data as Record<string, unknown>;
      expect(eventData.taskId).toBe(task.id);
      expect(eventData.attempt).toBe(2);
    });

    it('forwards repoUrl and repoBranch in the emitted event', async () => {
      const task = await createTestTask({ dispatch_attempts: 0 });
      const slack = makeSlackMock();
      const sentEvents: Array<{ name: string; data: unknown }> = [];

      const { error } = await makeEngine(slack, sentEvents).execute({
        events: makeRedispatchEvent(task.id, {
          attempt: 1,
          repoUrl: 'https://github.com/org/repo',
          repoBranch: 'fix/my-branch',
        }),
      });

      expect(error).toBeUndefined();
      expect(sentEvents).toHaveLength(1);
      const eventData = sentEvents[0].data as Record<string, unknown>;
      expect(eventData.repoUrl).toBe('https://github.com/org/repo');
      expect(eventData.repoBranch).toBe('fix/my-branch');
    });

    it('does not call Slack on successful re-dispatch', async () => {
      const task = await createTestTask({ dispatch_attempts: 1 });
      const slack = makeSlackMock();
      const sentEvents: Array<{ name: string; data: unknown }> = [];

      const { error } = await makeEngine(slack, sentEvents).execute({
        events: makeRedispatchEvent(task.id, { attempt: 2 }),
      });

      expect(error).toBeUndefined();
      expect(slack.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('wave-aware redispatch (RESUME_FROM_WAVE)', () => {
    it('includes resumeFromWave=2 in emitted event when latest execution has wave_number=2', async () => {
      const task = await createTestTask({ dispatch_attempts: 1 });
      await getPrisma().execution.create({
        data: { task_id: task.id, status: 'running', waveNumber: 2 },
      });
      const slack = makeSlackMock();
      const sentEvents: Array<{ name: string; data: unknown }> = [];

      const { error } = await makeEngine(slack, sentEvents).execute({
        events: makeRedispatchEvent(task.id, { attempt: 2 }),
      });

      expect(error).toBeUndefined();
      expect(sentEvents).toHaveLength(1);
      const eventData = sentEvents[0].data as Record<string, unknown>;
      expect(eventData.resumeFromWave).toBe(2);
    });

    it('includes resumeFromWave=3 in emitted event when latest execution has wave_number=3', async () => {
      const task = await createTestTask({ dispatch_attempts: 1 });
      await getPrisma().execution.create({
        data: { task_id: task.id, status: 'running', waveNumber: 3 },
      });
      const slack = makeSlackMock();
      const sentEvents: Array<{ name: string; data: unknown }> = [];

      const { error } = await makeEngine(slack, sentEvents).execute({
        events: makeRedispatchEvent(task.id, { attempt: 2 }),
      });

      expect(error).toBeUndefined();
      expect(sentEvents).toHaveLength(1);
      const eventData = sentEvents[0].data as Record<string, unknown>;
      expect(eventData.resumeFromWave).toBe(3);
    });

    it('omits resumeFromWave (null) in emitted event when no execution has wave_number', async () => {
      const task = await createTestTask({ dispatch_attempts: 0 });
      const slack = makeSlackMock();
      const sentEvents: Array<{ name: string; data: unknown }> = [];

      const { error } = await makeEngine(slack, sentEvents).execute({
        events: makeRedispatchEvent(task.id, { attempt: 1 }),
      });

      expect(error).toBeUndefined();
      expect(sentEvents).toHaveLength(1);
      const eventData = sentEvents[0].data as Record<string, unknown>;
      expect(eventData.resumeFromWave).toBeNull();
    });
  });
});
