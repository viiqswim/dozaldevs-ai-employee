import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

// Singleton PrismaClient for all tests
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
  // Delete in FK-safe order
  await prisma.taskStatusLog.deleteMany({});
  await prisma.validationRun.deleteMany({});
  await prisma.deliverable.deleteMany({});
  await prisma.execution.deleteMany({});
  await prisma.clarification.deleteMany({});
  await prisma.crossDeptTrigger.deleteMany({});
  await prisma.feedback.deleteMany({ where: { task_id: { not: null } } });
  await prisma.auditLog.deleteMany({});
  await prisma.task.deleteMany({});
  // NOTE: Do NOT delete projects or agent_versions — those are seed data
}

// Disconnect after all tests
export async function disconnectPrisma(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = undefined;
  }
}

// ============================================================
// Phase 2: Gateway Test Helpers
// ============================================================

/**
 * Compute Jira HMAC-SHA256 signature for use in tests.
 * Produces the exact format the gateway expects: "sha256=<hex>"
 */
export function computeJiraSignature(body: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${hmac}`;
}

/**
 * Inngest mock for tests — simple duck-typed object.
 * The gateway accepts an InngestLike object for dependency injection.
 * Always succeeds (returns a mock event ID).
 */
export const inngestMock = {
  send: async (_event: unknown): Promise<{ ids: string[] }> => {
    return { ids: ['mock-event-id'] };
  },
};

export async function createTestApp(opts?: {
  inngest?: { send(event: unknown): Promise<{ ids: string[] }> };
}) {
  const { buildApp } = await import('../src/gateway/server.js');

  process.env.JIRA_WEBHOOK_SECRET = process.env.JIRA_WEBHOOK_SECRET ?? 'test-secret';

  const app = await buildApp({
    inngestClient: opts?.inngest ?? inngestMock,
  });

  await app.ready();
  return app;
}

// Eagerly instantiate Prisma so .env is loaded (synchronously via new PrismaClient())
// before any test's beforeEach runs. Without this, Prisma's lazy .env loading on the
// first query can restore env vars that a beforeEach deleted (e.g. USE_LOCAL_DOCKER).
getPrisma()
  .$connect()
  .catch(() => {});

// After .env is loaded, clear USE_LOCAL_DOCKER so all tests default to the standard
// Fly.io dispatch path. Tests or describe blocks that specifically exercise local-docker
// behaviour should set process.env.USE_LOCAL_DOCKER = '1' in their own beforeEach.
delete process.env.USE_LOCAL_DOCKER;
