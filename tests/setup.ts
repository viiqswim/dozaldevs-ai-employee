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
 * Inngest mock for tests — replaces the real Inngest client.
 * The gateway accepts an InngestLike object for dependency injection.
 */
export const inngestMock = {
  send: async (_event: unknown): Promise<{ ids: string[] }> => {
    return { ids: ['mock-event-id'] };
  },
};

export async function createTestApp(opts?: { inngest?: typeof inngestMock }) {
  // Dynamic import to avoid TypeScript errors when server.ts doesn't exist
  // This function creates an isolated test instance of the Fastify app
  const { buildApp } = await import('../src/gateway/server.js');

  // Set required env vars for test
  process.env.JIRA_WEBHOOK_SECRET = process.env.JIRA_WEBHOOK_SECRET ?? 'test-secret';

  const app = await buildApp({
    inngestClient: opts?.inngest ?? inngestMock,
  });

  await app.ready();
  return app;
}
