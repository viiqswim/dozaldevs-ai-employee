import { describe, it, expect, afterEach, afterAll, vi, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  createTestApp,
  computeJiraSignature,
  inngestMock,
  getPrisma,
  cleanupTestData,
  disconnectPrisma,
  ADMIN_TEST_KEY,
} from '../setup.js';

const SECRET = 'test-secret';
const SEED_PROJECT_ID = '00000000-0000-0000-0000-000000000003';

function buildJiraPayload(projectKey: string, issueKey: string): string {
  return JSON.stringify({
    webhookEvent: 'jira:issue_created',
    timestamp: Date.now(),
    issue: {
      id: '99001',
      key: issueKey,
      self: `https://example.atlassian.net/rest/api/2/issue/99001`,
      fields: {
        summary: `Test task for ${projectKey}`,
        description: 'Integration regression test task',
        issuetype: { name: 'Task' },
        project: {
          id: '99000',
          key: projectKey,
          name: `${projectKey} Project`,
        },
        status: { name: 'To Do' },
        priority: { name: 'Medium' },
        labels: [],
        reporter: { displayName: 'Test User', accountId: 'test-account-id' },
        assignee: null,
      },
    },
  });
}

function webhookHeaders(body: string) {
  return {
    'content-type': 'application/json',
    'x-hub-signature': computeJiraSignature(body, SECRET),
  };
}

function adminHeaders() {
  return {
    'content-type': 'application/json',
    'x-admin-key': ADMIN_TEST_KEY,
  };
}

let app: FastifyInstance;

beforeEach(async () => {
  app = await createTestApp({ inngest: inngestMock, adminApiKey: ADMIN_TEST_KEY });
});

afterEach(async () => {
  await app.close();
  await cleanupTestData();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('POST /webhooks/jira — new project registration integration', () => {
  it('happy path: register project → send webhook → task created with correct project_id', async () => {
    // Step 1: Register a new project via POST /admin/projects
    const registerRes = await app.inject({
      method: 'POST',
      url: '/admin/projects',
      headers: adminHeaders(),
      payload: JSON.stringify({
        name: 'New Integration Test Project',
        repo_url: 'https://github.com/example/newproj-repo',
        jira_project_key: 'NEWPROJ',
      }),
    });

    expect(registerRes.statusCode).toBe(201);
    const newProject = JSON.parse(registerRes.body);
    expect(newProject.id).toBeTruthy();
    expect(newProject.jira_project_key).toBe('NEWPROJ');

    // Step 2: Send a Jira webhook with the new project's jira_project_key
    const body = buildJiraPayload('NEWPROJ', 'NEWPROJ-1');
    const webhookRes = await app.inject({
      method: 'POST',
      url: '/webhooks/jira',
      headers: webhookHeaders(body),
      payload: body,
    });

    expect(webhookRes.statusCode).toBe(200);
    const webhookJson = JSON.parse(webhookRes.body);
    expect(webhookJson.action).toBe('task_created');
    expect(webhookJson.taskId).toBeTruthy();

    // Step 3: Assert task was created and linked to the new project
    const task = await getPrisma().task.findUnique({ where: { id: webhookJson.taskId } });
    expect(task).not.toBeNull();
    expect(task!.project_id).toBe(newProject.id);
    expect(task!.status).toBe('Ready');
    expect(task!.source_system).toBe('jira');
    expect(task!.external_id).toBe('NEWPROJ-1');
  });

  it('webhook with unknown project key → 200 project_not_registered, no task created', async () => {
    const body = buildJiraPayload('NONEXISTENT', 'NONEXISTENT-1');
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/jira',
      headers: webhookHeaders(body),
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.action).toBe('project_not_registered');

    const count = await getPrisma().task.count();
    expect(count).toBe(0);
  });

  it('regression: webhook with seed project key TEST → task created with seed project_id', async () => {
    // The seed project (key='TEST', id='00000000-0000-0000-0000-000000000003') must
    // continue to work exactly as before — this is a regression guard.
    const body = buildJiraPayload('TEST', 'TEST-99');
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/jira',
      headers: webhookHeaders(body),
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.action).toBe('task_created');
    expect(json.taskId).toBeTruthy();

    const task = await getPrisma().task.findUnique({ where: { id: json.taskId } });
    expect(task).not.toBeNull();
    expect(task!.project_id).toBe(SEED_PROJECT_ID);
    expect(task!.external_id).toBe('TEST-99');
  });
});
