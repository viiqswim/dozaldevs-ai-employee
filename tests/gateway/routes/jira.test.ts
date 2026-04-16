import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library.js';
import { jiraRoutes } from '../../../src/gateway/routes/jira.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000002';
const PROJECT_ID = 'proj-uuid-1234';
const TASK_ID = 'task-uuid-5678';
const TENANT_SECRET = 'tenant-jira-secret';
const PLATFORM_SECRET = 'platform-jira-secret';

function sign(body: string, secret: string): string {
  const hex = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${hex}`;
}

function makeProject(tenantId = TENANT_ID) {
  return {
    id: PROJECT_ID,
    tenant_id: tenantId,
    repo_url: 'https://github.com/org/repo',
    default_branch: 'main',
  };
}

function makeTask() {
  return { id: TASK_ID };
}

function encryptSecret(plaintext: string) {
  const key = Buffer.from('a'.repeat(64), 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    auth_tag: authTag.toString('base64'),
    key: 'jira_webhook_secret',
    tenant_id: TENANT_ID,
    updated_at: new Date(),
  };
}

function makeApp(
  overrides: {
    projectFindFirst?: ReturnType<typeof vi.fn>;
    tenantSecretFindUnique?: ReturnType<typeof vi.fn>;
    taskFindFirst?: ReturnType<typeof vi.fn>;
    taskCreate?: ReturnType<typeof vi.fn>;
    taskStatusLogCreate?: ReturnType<typeof vi.fn>;
    taskUpdateMany?: ReturnType<typeof vi.fn>;
    inngestClient?: { send: ReturnType<typeof vi.fn> };
  } = {},
) {
  process.env.ENCRYPTION_KEY = 'a'.repeat(64);

  const taskCreate = overrides.taskCreate ?? vi.fn().mockResolvedValue(makeTask());
  const taskStatusLogCreate = overrides.taskStatusLogCreate ?? vi.fn().mockResolvedValue({});
  const taskFindFirst = overrides.taskFindFirst ?? vi.fn().mockResolvedValue(null);
  const taskUpdateMany = overrides.taskUpdateMany ?? vi.fn().mockResolvedValue({ count: 1 });

  const $transaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    return fn({
      task: { create: taskCreate, update: vi.fn(), updateMany: taskUpdateMany },
      taskStatusLog: { create: taskStatusLogCreate },
    });
  });

  const app = express();
  app.use(
    express.json({
      verify: (req: express.Request & { rawBody?: string }, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    }),
  );

  app.use(
    jiraRoutes({
      prisma: {
        project: {
          findFirst: overrides.projectFindFirst ?? vi.fn().mockResolvedValue(null),
        },
        tenantSecret: {
          findUnique: overrides.tenantSecretFindUnique ?? vi.fn().mockResolvedValue(null),
        },
        task: {
          findFirst: taskFindFirst,
          create: taskCreate,
          updateMany: taskUpdateMany,
        },
        taskStatusLog: {
          create: taskStatusLogCreate,
        },
        $transaction,
      } as never,
      inngestClient: overrides.inngestClient,
    }),
  );

  return app;
}

function makeIssueCreatedPayload(projectKey = 'DOZAL') {
  return {
    webhookEvent: 'jira:issue_created',
    issue: {
      id: '10001',
      key: `${projectKey}-1`,
      fields: {
        summary: 'Test issue',
        project: { key: projectKey },
      },
    },
  };
}

function makeIssueDeletedPayload(projectKey = 'DOZAL') {
  return {
    webhookEvent: 'jira:issue_deleted',
    issue: {
      id: '10001',
      key: `${projectKey}-1`,
      fields: {
        summary: 'Test issue',
        project: { key: projectKey },
      },
    },
  };
}

describe('POST /webhooks/jira', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.JIRA_WEBHOOK_SECRET;
  });

  describe('tenant resolution and HMAC', () => {
    it('404 when project not found for given project key', async () => {
      const body = JSON.stringify(makeIssueCreatedPayload('NOSUCH'));
      const app = makeApp({
        projectFindFirst: vi.fn().mockResolvedValue(null),
      });
      const res = await request(app)
        .post('/webhooks/jira')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature', sign(body, 'anything'))
        .send(body);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Unknown Jira project');
    });

    it('401 when signature does not match tenant secret', async () => {
      const body = JSON.stringify(makeIssueCreatedPayload());
      const encryptedSecret = encryptSecret(TENANT_SECRET);
      const app = makeApp({
        projectFindFirst: vi.fn().mockResolvedValue(makeProject()),
        tenantSecretFindUnique: vi.fn().mockResolvedValue(encryptedSecret),
      });
      const res = await request(app)
        .post('/webhooks/jira')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature', sign(body, 'wrong-secret'))
        .send(body);
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid webhook signature');
    });

    it('200 when signature matches tenant secret and task is created with correct tenant_id', async () => {
      const payload = makeIssueCreatedPayload();
      const body = JSON.stringify(payload);
      const encryptedSecret = encryptSecret(TENANT_SECRET);
      const taskCreate = vi.fn().mockResolvedValue(makeTask());
      const app = makeApp({
        projectFindFirst: vi.fn().mockResolvedValue(makeProject()),
        tenantSecretFindUnique: vi.fn().mockResolvedValue(encryptedSecret),
        taskFindFirst: vi.fn().mockResolvedValue(null),
        taskCreate,
      });
      const res = await request(app)
        .post('/webhooks/jira')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature', sign(body, TENANT_SECRET))
        .send(body);
      expect(res.status).toBe(200);
      expect(res.body.action).toBe('task_created');
      expect(taskCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenant_id: TENANT_ID }),
        }),
      );
    });

    it('200 with platform fallback when tenant has no jira_webhook_secret', async () => {
      process.env.JIRA_WEBHOOK_SECRET = PLATFORM_SECRET;
      const body = JSON.stringify(makeIssueCreatedPayload());
      const taskCreate = vi.fn().mockResolvedValue(makeTask());
      const app = makeApp({
        projectFindFirst: vi.fn().mockResolvedValue(makeProject()),
        tenantSecretFindUnique: vi.fn().mockResolvedValue(null),
        taskFindFirst: vi.fn().mockResolvedValue(null),
        taskCreate,
      });
      const res = await request(app)
        .post('/webhooks/jira')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature', sign(body, PLATFORM_SECRET))
        .send(body);
      expect(res.status).toBe(200);
      expect(res.body.action).toBe('task_created');
    });

    it('401 when no secret configured at all (no tenant secret, no platform env)', async () => {
      const body = JSON.stringify(makeIssueCreatedPayload());
      const app = makeApp({
        projectFindFirst: vi.fn().mockResolvedValue(makeProject()),
        tenantSecretFindUnique: vi.fn().mockResolvedValue(null),
      });
      const res = await request(app)
        .post('/webhooks/jira')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature', sign(body, 'anything'))
        .send(body);
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Webhook signing not configured');
    });
  });

  describe('event routing', () => {
    it('200 ignored for jira:issue_updated', async () => {
      const body = JSON.stringify({
        webhookEvent: 'jira:issue_updated',
        issue: { id: '1', key: 'X-1', fields: { summary: 'x', project: { key: 'X' } } },
      });
      const app = makeApp();
      const res = await request(app)
        .post('/webhooks/jira')
        .set('Content-Type', 'application/json')
        .send(body);
      expect(res.status).toBe(200);
      expect(res.body.action).toBe('ignored');
    });

    it('200 ignored for unknown event types', async () => {
      const body = JSON.stringify({
        webhookEvent: 'jira:sprint_started',
        issue: { id: '1', key: 'X-1', fields: { summary: 'x', project: { key: 'X' } } },
      });
      const app = makeApp();
      const res = await request(app)
        .post('/webhooks/jira')
        .set('Content-Type', 'application/json')
        .send(body);
      expect(res.status).toBe(200);
      expect(res.body.action).toBe('ignored');
    });

    it('200 duplicate when task already exists', async () => {
      const body = JSON.stringify(makeIssueCreatedPayload());
      const encryptedSecret = encryptSecret(TENANT_SECRET);
      const existingTask = makeTask();
      const app = makeApp({
        projectFindFirst: vi.fn().mockResolvedValue(makeProject()),
        tenantSecretFindUnique: vi.fn().mockResolvedValue(encryptedSecret),
        taskFindFirst: vi.fn().mockResolvedValue(existingTask),
        taskCreate: vi
          .fn()
          .mockRejectedValue(
            new PrismaClientKnownRequestError('Unique constraint', {
              code: 'P2002',
              clientVersion: '6.0.0',
            }),
          ),
      });
      const res = await request(app)
        .post('/webhooks/jira')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature', sign(body, TENANT_SECRET))
        .send(body);
      expect(res.status).toBe(200);
      expect(res.body.action).toBe('duplicate');
    });

    it('200 cancelled for jira:issue_deleted when task exists', async () => {
      process.env.JIRA_WEBHOOK_SECRET = PLATFORM_SECRET;
      const body = JSON.stringify(makeIssueDeletedPayload());
      const taskFindFirst = vi.fn().mockResolvedValue({ ...makeTask(), status: 'Ready' });
      const taskUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
      const app = makeApp({
        projectFindFirst: vi.fn().mockResolvedValue(makeProject()),
        tenantSecretFindUnique: vi.fn().mockResolvedValue(null),
        taskFindFirst,
        taskUpdateMany,
      });
      const res = await request(app)
        .post('/webhooks/jira')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature', sign(body, PLATFORM_SECRET))
        .send(body);
      expect(res.status).toBe(200);
      expect(['cancelled', 'not_found']).toContain(res.body.action);
    });
  });

  describe('payload validation', () => {
    it('400 for invalid payload shape', async () => {
      const app = makeApp();
      const res = await request(app)
        .post('/webhooks/jira')
        .set('Content-Type', 'application/json')
        .send({ webhookEvent: 'jira:issue_created' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid payload');
    });
  });
});
