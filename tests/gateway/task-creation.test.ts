import { describe, it, expect, afterEach, afterAll } from 'vitest';
import {
  createTaskFromJiraWebhook,
  cancelTaskByExternalId,
} from '../../src/gateway/services/task-creation.js';
import { getPrisma, cleanupTestData, disconnectPrisma } from '../setup.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { JiraWebhookPayload } from '../../src/gateway/validation/schemas.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const SEED_PROJECT_ID = '00000000-0000-0000-0000-000000000003';

function loadFixture(name: string): JiraWebhookPayload {
  return JSON.parse(readFileSync(resolve('test-payloads', name), 'utf8'));
}

afterEach(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('createTaskFromJiraWebhook', () => {
  it('creates task with status Ready', async () => {
    const prisma = getPrisma();
    const payload = loadFixture('jira-issue-created.json');
    const result = await createTaskFromJiraWebhook({
      payload,
      projectId: SEED_PROJECT_ID,
      tenantId: TENANT_ID,
      prisma,
    });

    expect(result.created).toBe(true);
    expect(result.task.status).toBe('Ready');
    expect(result.task.external_id).toBe('TEST-1');
    expect(result.task.source_system).toBe('jira');
    expect(result.task.project_id).toBe(SEED_PROJECT_ID);
    expect(result.task.tenant_id).toBe(TENANT_ID);
  });

  it('triage_result has all 6 required fields', async () => {
    const prisma = getPrisma();
    const payload = loadFixture('jira-issue-created.json');
    const result = await createTaskFromJiraWebhook({
      payload,
      projectId: SEED_PROJECT_ID,
      tenantId: TENANT_ID,
      prisma,
    });

    const triageResult = result.task.triage_result as Record<string, unknown>;
    expect(triageResult.ticket_id).toBe('TEST-1');
    expect(triageResult.title).toBeTruthy();
    expect('description' in triageResult).toBe(true);
    expect(Array.isArray(triageResult.labels)).toBe(true);
    expect('priority' in triageResult).toBe(true);
    expect(triageResult.raw_ticket).toBeTruthy();
  });

  it('raw_event contains full payload', async () => {
    const prisma = getPrisma();
    const payload = loadFixture('jira-issue-created.json');
    const result = await createTaskFromJiraWebhook({
      payload,
      projectId: SEED_PROJECT_ID,
      tenantId: TENANT_ID,
      prisma,
    });

    const rawEvent = result.task.raw_event as Record<string, unknown>;
    expect(rawEvent).not.toBeNull();
    expect(rawEvent.webhookEvent).toBe('jira:issue_created');
  });

  it('creates task_status_log entry with correct fields', async () => {
    const prisma = getPrisma();
    const payload = loadFixture('jira-issue-created.json');
    const result = await createTaskFromJiraWebhook({
      payload,
      projectId: SEED_PROJECT_ID,
      tenantId: TENANT_ID,
      prisma,
    });

    const log = await prisma.taskStatusLog.findFirst({
      where: { task_id: result.task.id },
    });

    expect(log).not.toBeNull();
    expect(log!.from_status).toBeNull();
    expect(log!.to_status).toBe('Ready');
    expect(log!.actor).toBe('gateway');
  });

  it('handles duplicate webhook (P2002) — returns existing task, created=false', async () => {
    const prisma = getPrisma();
    const payload = loadFixture('jira-issue-created.json');

    const first = await createTaskFromJiraWebhook({
      payload,
      projectId: SEED_PROJECT_ID,
      tenantId: TENANT_ID,
      prisma,
    });
    expect(first.created).toBe(true);

    const second = await createTaskFromJiraWebhook({
      payload,
      projectId: SEED_PROJECT_ID,
      tenantId: TENANT_ID,
      prisma,
    });
    expect(second.created).toBe(false);
    expect(second.task.id).toBe(first.task.id);
  });

  it('duplicate does NOT create extra status log entry', async () => {
    const prisma = getPrisma();
    const payload = loadFixture('jira-issue-created.json');

    await createTaskFromJiraWebhook({
      payload,
      projectId: SEED_PROJECT_ID,
      tenantId: TENANT_ID,
      prisma,
    });
    await createTaskFromJiraWebhook({
      payload,
      projectId: SEED_PROJECT_ID,
      tenantId: TENANT_ID,
      prisma,
    });

    const count = await prisma.taskStatusLog.count({
      where: { task: { external_id: 'TEST-1', source_system: 'jira' } },
    });
    expect(count).toBe(1);
  });
});

describe('cancelTaskByExternalId', () => {
  it('cancels an existing Ready task', async () => {
    const prisma = getPrisma();
    const payload = loadFixture('jira-issue-created.json');
    await createTaskFromJiraWebhook({
      payload,
      projectId: SEED_PROJECT_ID,
      tenantId: TENANT_ID,
      prisma,
    });

    const result = await cancelTaskByExternalId({
      externalId: 'TEST-1',
      sourceSystem: 'jira',
      tenantId: TENANT_ID,
      prisma,
    });

    expect(result).toBe(true);

    const task = await prisma.task.findFirst({ where: { external_id: 'TEST-1' } });
    expect(task!.status).toBe('Cancelled');

    const cancelLog = await prisma.taskStatusLog.findFirst({
      where: { task_id: task!.id, to_status: 'Cancelled' },
    });
    expect(cancelLog).not.toBeNull();
    expect(cancelLog!.from_status).toBe('Ready');
    expect(cancelLog!.actor).toBe('gateway');
  });

  it('returns false for non-existent task', async () => {
    const prisma = getPrisma();
    const result = await cancelTaskByExternalId({
      externalId: 'NONEXISTENT-1',
      sourceSystem: 'jira',
      tenantId: TENANT_ID,
      prisma,
    });
    expect(result).toBe(false);
  });

  it('returns false for already Done task', async () => {
    const prisma = getPrisma();
    const task = await prisma.task.create({
      data: {
        external_id: 'TEST-DONE',
        source_system: 'jira',
        status: 'Done',
        tenant_id: TENANT_ID,
      },
    });

    const result = await cancelTaskByExternalId({
      externalId: 'TEST-DONE',
      sourceSystem: 'jira',
      tenantId: TENANT_ID,
      prisma,
    });
    expect(result).toBe(false);

    await prisma.task.delete({ where: { id: task.id } });
  });

  it('returns false for already Cancelled task', async () => {
    const prisma = getPrisma();
    const payload = loadFixture('jira-issue-created.json');
    await createTaskFromJiraWebhook({
      payload,
      projectId: SEED_PROJECT_ID,
      tenantId: TENANT_ID,
      prisma,
    });

    await cancelTaskByExternalId({
      externalId: 'TEST-1',
      sourceSystem: 'jira',
      tenantId: TENANT_ID,
      prisma,
    });

    const result = await cancelTaskByExternalId({
      externalId: 'TEST-1',
      sourceSystem: 'jira',
      tenantId: TENANT_ID,
      prisma,
    });
    expect(result).toBe(false);
  });
});
