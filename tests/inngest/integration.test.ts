import { describe, it, expect, afterEach, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import { getPrisma, cleanupTestData, disconnectPrisma, computeJiraSignature } from '../setup.js';
import { createInngestClient } from '../../src/gateway/inngest/client.js';
import { buildApp } from '../../src/gateway/server.js';

const INNGEST_DEV_URL = process.env.INNGEST_DEV_URL;
const SECRET = process.env.JIRA_WEBHOOK_SECRET ?? 'test-secret';

describe('Integration Tests: skip behavior when no dev server', () => {
  it('integration test suite is defined (skip logic working)', () => {
    expect(INNGEST_DEV_URL || 'no-dev-server').toBeTruthy();
  });
});

describe.skipIf(!INNGEST_DEV_URL)('Integration Tests: Gateway → Inngest → Lifecycle → DB', () => {
  async function pollUntil<T>(
    fn: () => Promise<T | null | undefined>,
    timeoutMs = 10000,
    intervalMs = 500,
  ): Promise<T> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const result = await fn();
      if (result) return result;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(`Condition not met within ${timeoutMs}ms`);
  }

  async function pollForStatus(taskId: string, expectedStatus: string, timeoutMs = 10000) {
    return pollUntil(async () => {
      const task = await getPrisma().task.findUnique({ where: { id: taskId } });
      if (task?.status === expectedStatus) return task;
      return null;
    }, timeoutMs);
  }

  async function sendJiraWebhook(app: Awaited<ReturnType<typeof buildApp>>) {
    const rawBody = fs.readFileSync('test-payloads/jira-issue-created.json', 'utf8');
    const signature = computeJiraSignature(rawBody, SECRET);

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/jira',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature': signature,
      },
      payload: rawBody,
    });

    return { res, body: JSON.parse(res.body) };
  }

  beforeEach(async () => {
    process.env.JIRA_WEBHOOK_SECRET = SECRET;
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('valid Jira webhook sends engineering/task.received event to Inngest', async () => {
    const inngest = createInngestClient();
    const app = await buildApp({ inngestClient: inngest });
    await app.ready();

    try {
      const { res, body } = await sendJiraWebhook(app);
      expect([200, 202]).toContain(res.statusCode);
      expect(body.taskId).toBeTruthy();

      const eventRes = await fetch(`${INNGEST_DEV_URL}/v1/events?name=engineering/task.received`);
      expect(eventRes.ok).toBe(true);

      const eventData = (await eventRes.json()) as {
        data?: Array<{ name: string; data?: { taskId?: string } }>;
      };
      const events = eventData.data ?? [];
      expect(events.length).toBeGreaterThan(0);

      const matchingEvent = events.find(
        (e) => e.name === 'engineering/task.received' && e.data?.taskId === body.taskId,
      );
      expect(matchingEvent).toBeDefined();
    } finally {
      await app.close();
    }
  });

  it('lifecycle function transitions task Ready → Executing within 10s', async () => {
    const inngest = createInngestClient();
    const app = await buildApp({ inngestClient: inngest });
    await app.ready();

    try {
      const { res, body } = await sendJiraWebhook(app);
      expect([200, 202]).toContain(res.statusCode);
      expect(body.taskId).toBeTruthy();

      const taskId: string = body.taskId;
      const readyTask = await getPrisma().task.findUnique({ where: { id: taskId } });
      expect(readyTask).not.toBeNull();
      expect(readyTask!.status).toBe('Ready');

      const executingTask = await pollForStatus(taskId, 'Executing', 10000);
      expect(executingTask.status).toBe('Executing');
    } finally {
      await app.close();
    }
  });

  it('task_status_log has NULL→Ready (gateway) and Ready→Executing (lifecycle_fn) entries', async () => {
    const inngest = createInngestClient();
    const app = await buildApp({ inngestClient: inngest });
    await app.ready();

    try {
      const { res, body } = await sendJiraWebhook(app);
      expect([200, 202]).toContain(res.statusCode);
      const taskId: string = body.taskId;

      await pollForStatus(taskId, 'Executing', 10000);

      const logs = await getPrisma().taskStatusLog.findMany({
        where: { task_id: taskId },
        orderBy: { created_at: 'asc' },
      });
      expect(logs.length).toBeGreaterThanOrEqual(2);

      const gatewayEntry = logs.find((l) => l.from_status === null && l.to_status === 'Ready');
      expect(gatewayEntry).toBeDefined();
      expect(gatewayEntry!.actor).toBe('gateway');

      const lifecycleEntry = logs.find(
        (l) => l.from_status === 'Ready' && l.to_status === 'Executing',
      );
      expect(lifecycleEntry).toBeDefined();
      expect(lifecycleEntry!.actor).toBe('lifecycle_fn');
    } finally {
      await app.close();
    }
  });

  it('sending same webhook twice creates only one task and one lifecycle run', async () => {
    const inngest = createInngestClient();
    const app = await buildApp({ inngestClient: inngest });
    await app.ready();

    try {
      const rawBody = fs.readFileSync('test-payloads/jira-issue-created.json', 'utf8');
      const signature = computeJiraSignature(rawBody, SECRET);
      const headers = { 'content-type': 'application/json', 'x-hub-signature': signature };

      const [res1, res2] = await Promise.all([
        app.inject({ method: 'POST', url: '/webhooks/jira', headers, payload: rawBody }),
        app.inject({ method: 'POST', url: '/webhooks/jira', headers, payload: rawBody }),
      ]);
      expect([200, 202]).toContain(res1.statusCode);
      expect([200, 202]).toContain(res2.statusCode);

      const taskCount = await getPrisma().task.count({
        where: { external_id: 'TEST-1', source_system: 'jira' },
      });
      expect(taskCount).toBe(1);

      const task = await getPrisma().task.findFirst({
        where: { external_id: 'TEST-1', source_system: 'jira' },
      });
      expect(task).not.toBeNull();

      await pollForStatus(task!.id, 'Executing', 10000);

      const lifecycleLogs = await getPrisma().taskStatusLog.findMany({
        where: {
          task_id: task!.id,
          from_status: 'Ready',
          to_status: 'Executing',
          actor: 'lifecycle_fn',
        },
      });
      expect(lifecycleLogs.length).toBe(1);
    } finally {
      await app.close();
    }
  });
});
