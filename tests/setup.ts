import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { Inngest } from 'inngest';

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
 * Inngest client for tests — uses real Inngest instance with test configuration.
 * The gateway accepts an Inngest client for dependency injection.
 */
export const inngestMock = new Inngest({
  id: 'test-gateway',
  baseUrl: 'http://localhost:8288',
  fetch: async () => {
    return new Response(JSON.stringify({ functions: [] }), { status: 200 });
  },
});

export async function createTestApp(opts?: { inngest?: Inngest }) {
  const { buildApp } = await import('../src/gateway/server.js');

  process.env.JIRA_WEBHOOK_SECRET = process.env.JIRA_WEBHOOK_SECRET ?? 'test-secret';

  const app = await buildApp({
    inngestClient: opts?.inngest ?? inngestMock,
  });

  await app.ready();
  return app;
}
