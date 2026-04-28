import crypto from 'crypto';
import * as http from 'node:http';
import supertest from 'supertest';
import type { Application } from 'express';
import { PrismaClient } from '@prisma/client';

export const ADMIN_TEST_KEY = 'test-admin-key-do-not-use-in-prod';

let _prisma: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient();
  }
  return _prisma;
}

// Clean up test-inserted data but preserve seed records
export async function cleanupTestData(): Promise<void> {
  const prisma = getPrisma();
  await prisma.knowledgeBaseEntry.deleteMany({
    where: {
      id: {
        notIn: [
          '00000000-0000-0000-0000-000000000100',
          '00000000-0000-0000-0000-000000000101',
          '00000000-0000-0000-0000-000000000102',
          '00000000-0000-0000-0000-000000000103',
        ],
      },
    },
  });
  await prisma.taskStatusLog.deleteMany({});
  await prisma.validationRun.deleteMany({});
  await prisma.deliverable.deleteMany({});
  await prisma.execution.deleteMany({});
  await prisma.clarification.deleteMany({});
  await prisma.crossDeptTrigger.deleteMany({});
  await prisma.feedback.deleteMany({ where: { task_id: { not: null } } });
  await prisma.auditLog.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.project.deleteMany({
    where: { id: { not: '00000000-0000-0000-0000-000000000003' } },
  });
}

export async function disconnectPrisma(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = undefined;
  }
}

export class TestApp {
  private readonly _server: http.Server;

  constructor(private readonly _app: Application) {
    this._server = http.createServer(_app);
  }

  async ready(): Promise<void> {}

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      if (!this._server.listening) {
        resolve();
        return;
      }
      this._server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  async inject(opts: {
    method: string;
    url: string;
    headers?: Record<string, string | string[]>;
    payload?: unknown;
  }): Promise<{ statusCode: number; body: string }> {
    const method = opts.method.toLowerCase() as keyof supertest.SuperTest<supertest.Test>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let req = (supertest(this._server) as any)[method](opts.url) as supertest.Test;

    if (opts.headers) {
      for (const [key, val] of Object.entries(opts.headers)) {
        req = req.set(key, Array.isArray(val) ? val.join(', ') : val);
      }
    }

    if (opts.payload !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      req = req.send(opts.payload as any);
    }

    const res = await req;
    return {
      statusCode: res.status,
      body: res.text,
    };
  }
}

export function computeJiraSignature(body: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${hmac}`;
}

export const inngestMock = {
  send: async (_event: unknown): Promise<{ ids: string[] }> => {
    return { ids: ['mock-event-id'] };
  },
};

export async function createTestApp(opts?: {
  inngest?: { send(event: unknown): Promise<{ ids: string[] }> };
  adminApiKey?: string;
}): Promise<TestApp> {
  const { buildApp } = await import('../src/gateway/server.js');

  process.env.JIRA_WEBHOOK_SECRET = process.env.JIRA_WEBHOOK_SECRET ?? 'test-secret';
  process.env.ADMIN_API_KEY = opts?.adminApiKey ?? ADMIN_TEST_KEY;

  const { app } = await buildApp({
    inngestClient: opts?.inngest ?? inngestMock,
  });

  return new TestApp(app);
}

getPrisma()
  .$connect()
  .catch(() => {});

delete process.env.USE_LOCAL_DOCKER;
