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
