import { describe, it, expect, afterEach, afterAll, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  TestApp,
  createTestApp,
  computeJiraSignature,
  inngestMock,
  getPrisma,
  cleanupTestData,
  disconnectPrisma,
} from '../setup.js';

const SECRET = 'test-secret';

function loadRaw(name: string): string {
  return readFileSync(resolve('test-payloads', name), 'utf8');
}

function validHeaders(body: string, secret = SECRET) {
  return {
    'content-type': 'application/json',
    'x-hub-signature': computeJiraSignature(body, secret),
  };
}

let app: TestApp;

beforeEach(async () => {
  app = await createTestApp({ inngest: inngestMock });
});

afterEach(async () => {
  await app.close();
  await cleanupTestData();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('POST /webhooks/jira', () => {
  it('happy path: valid webhook → 200 with task_created', async () => {
    const body = loadRaw('jira-issue-created.json');
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/jira',
      headers: validHeaders(body),
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.action).toBe('task_created');
    expect(json.taskId).toBeTruthy();
  });

  it('happy path: task has correct status Ready and source_system jira', async () => {
    const body = loadRaw('jira-issue-created.json');
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/jira',
      headers: validHeaders(body),
      payload: body,
    });
    const { taskId } = JSON.parse(res.body);

    const task = await getPrisma().task.findUnique({ where: { id: taskId } });
    expect(task).not.toBeNull();
    expect(task!.status).toBe('Ready');
    expect(task!.source_system).toBe('jira');
    expect(task!.external_id).toBe('TEST-1');
  });

  it('happy path: status_log entry created', async () => {
    const body = loadRaw('jira-issue-created.json');
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/jira',
      headers: validHeaders(body),
      payload: body,
    });
    const { taskId } = JSON.parse(res.body);

    const log = await getPrisma().taskStatusLog.findFirst({ where: { task_id: taskId } });
    expect(log).not.toBeNull();
    expect(log!.from_status).toBeNull();
    expect(log!.to_status).toBe('Ready');
    expect(log!.actor).toBe('gateway');
  });

  it('invalid signature → 401, no DB writes', async () => {
    const body = loadRaw('jira-issue-created.json');
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/jira',
      headers: { 'content-type': 'application/json', 'x-hub-signature': 'sha256=invalid' },
      payload: body,
    });

    expect(res.statusCode).toBe(401);
    const count = await getPrisma().task.count();
    expect(count).toBe(0);
  });

  it('invalid payload (missing required fields) → 400, no DB writes', async () => {
    const body = loadRaw('jira-issue-created-invalid.json');
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/jira',
      headers: validHeaders(body),
      payload: body,
    });

    expect(res.statusCode).toBe(400);
    const count = await getPrisma().task.count();
    expect(count).toBe(0);
  });

  it('unknown project → 404, no task', async () => {
    const body = loadRaw('jira-issue-created-unknown-project.json');
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/jira',
      headers: validHeaders(body),
      payload: body,
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe('Unknown Jira project');
    const count = await getPrisma().task.count();
    expect(count).toBe(0);
  });

  it('duplicate webhook → 200 duplicate, no extra task or log', async () => {
    const body = loadRaw('jira-issue-created.json');

    await app.inject({
      method: 'POST',
      url: '/webhooks/jira',
      headers: validHeaders(body),
      payload: body,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/jira',
      headers: validHeaders(body),
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).action).toBe('duplicate');
    const count = await getPrisma().task.count({ where: { external_id: 'TEST-1' } });
    expect(count).toBe(1);
    const logCount = await getPrisma().taskStatusLog.count({
      where: { task: { external_id: 'TEST-1' } },
    });
    expect(logCount).toBe(1);
  });

  it('issue_updated → 200 ignored (per §4.2)', async () => {
    const updatedBody = JSON.stringify({
      webhookEvent: 'jira:issue_updated',
      issue: { id: '1', key: 'TEST-1', fields: { summary: 'Test', project: { key: 'TEST' } } },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/jira',
      headers: validHeaders(updatedBody),
      payload: updatedBody,
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).action).toBe('ignored');
    const count = await getPrisma().task.count();
    expect(count).toBe(0);
  });

  it('issue_deleted: cancels existing task → 200 cancelled', async () => {
    const createBody = loadRaw('jira-issue-created.json');
    await app.inject({
      method: 'POST',
      url: '/webhooks/jira',
      headers: validHeaders(createBody),
      payload: createBody,
    });

    const deleteBody = loadRaw('jira-issue-deleted.json');
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/jira',
      headers: validHeaders(deleteBody),
      payload: deleteBody,
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).action).toBe('cancelled');
    const task = await getPrisma().task.findFirst({ where: { external_id: 'TEST-1' } });
    expect(task!.status).toBe('Cancelled');
  });

  it('issue_deleted: non-existent task → 200 not_found', async () => {
    const deleteBody = loadRaw('jira-issue-deleted.json');
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/jira',
      headers: validHeaders(deleteBody),
      payload: deleteBody,
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).action).toBe('not_found');
  });

  it('triage_result has all required fields', async () => {
    const body = loadRaw('jira-issue-created.json');
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/jira',
      headers: validHeaders(body),
      payload: body,
    });
    const { taskId } = JSON.parse(res.body);

    const task = await getPrisma().task.findUnique({ where: { id: taskId } });
    const tr = task!.triage_result as Record<string, unknown>;
    expect(tr.ticket_id).toBe('TEST-1');
    expect(tr.title).toBeTruthy();
    expect('description' in tr).toBe(true);
    expect(Array.isArray(tr.labels)).toBe(true);
    expect('priority' in tr).toBe(true);
    expect(tr.raw_ticket).toBeTruthy();
  });

  it('raw_event contains full payload', async () => {
    const body = loadRaw('jira-issue-created.json');
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/jira',
      headers: validHeaders(body),
      payload: body,
    });
    const { taskId } = JSON.parse(res.body);

    const task = await getPrisma().task.findUnique({ where: { id: taskId } });
    const rawEvent = task!.raw_event as Record<string, unknown>;
    expect(rawEvent.webhookEvent).toBe('jira:issue_created');
  });

  it('Inngest send failure → 202, task still in DB', async () => {
    const failingInngest = {
      send: async () => {
        throw new Error('Inngest down');
      },
    };
    const failingApp = await createTestApp({
      inngest: failingInngest,
    });

    const body = loadRaw('jira-issue-created.json');
    const res = await failingApp.inject({
      method: 'POST',
      url: '/webhooks/jira',
      headers: validHeaders(body),
      payload: body,
    });

    await failingApp.close();

    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body).action).toBe('queued_without_inngest');
    const task = await getPrisma().task.findFirst({ where: { external_id: 'TEST-1' } });
    expect(task).not.toBeNull();
  });
});
