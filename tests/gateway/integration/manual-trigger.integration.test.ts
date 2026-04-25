import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { getPrisma, disconnectPrisma } from '../../setup.js';
import { dispatchEmployee } from '../../../src/gateway/services/employee-dispatcher.js';
import type { InngestLike } from '../../../src/gateway/server.js';

const DOZALDEVS_TENANT_ID = '00000000-0000-0000-0000-000000000002';

beforeAll(async () => {
  const prisma = getPrisma();
  const archetype = await prisma.archetype.findFirst({
    where: { tenant_id: DOZALDEVS_TENANT_ID, role_name: 'daily-summarizer' },
  });
  if (!archetype) {
    throw new Error(
      'daily-summarizer archetype not found — run pnpm setup or pnpm prisma db seed first',
    );
  }
});

afterAll(async () => {
  await disconnectPrisma();
});

beforeEach(async () => {
  await getPrisma().task.deleteMany({
    where: { source_system: 'manual', external_id: { startsWith: 'manual-' } },
  });
});

function makeInngestSpy(): InngestLike {
  return { send: vi.fn().mockResolvedValue({ ids: ['mock-event-id'] }) };
}

describe('manual employee trigger — integration', () => {
  it('dispatches task: creates DB row with source_system=manual and fires Inngest event', async () => {
    const spy = makeInngestSpy();
    const result = await dispatchEmployee({
      tenantId: DOZALDEVS_TENANT_ID,
      slug: 'daily-summarizer',
      dryRun: false,
      prisma: getPrisma(),
      inngest: spy,
    });

    expect(result.kind).toBe('dispatched');
    if (result.kind !== 'dispatched') return;

    const task = await getPrisma().task.findUnique({ where: { id: result.taskId } });
    expect(task).not.toBeNull();
    expect(task!.source_system).toBe('manual');
    expect(task!.status).toBe('Ready');
    expect(task!.external_id).toMatch(/^manual-/);
    expect(task!.tenant_id).toBe(DOZALDEVS_TENANT_ID);

    expect(spy.send).toHaveBeenCalledOnce();
    const sendArg = (spy.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sendArg.name).toBe('employee/task.dispatched');
    expect(sendArg.data.taskId).toBe(result.taskId);
    expect(sendArg.data.archetypeId).toBe(result.archetypeId);
  });

  it('dry-run: creates no DB row and fires no Inngest event', async () => {
    const spy = makeInngestSpy();
    const countBefore = await getPrisma().task.count({ where: { source_system: 'manual' } });

    const result = await dispatchEmployee({
      tenantId: DOZALDEVS_TENANT_ID,
      slug: 'daily-summarizer',
      dryRun: true,
      prisma: getPrisma(),
      inngest: spy,
    });

    expect(result.kind).toBe('dry_run');
    const countAfter = await getPrisma().task.count({ where: { source_system: 'manual' } });
    expect(countAfter).toBe(countBefore);
    expect(spy.send).not.toHaveBeenCalled();
  });

  it('two dispatches create two distinct tasks with distinct external_ids', async () => {
    const spy1 = makeInngestSpy();
    const spy2 = makeInngestSpy();

    const r1 = await dispatchEmployee({
      tenantId: DOZALDEVS_TENANT_ID,
      slug: 'daily-summarizer',
      dryRun: false,
      prisma: getPrisma(),
      inngest: spy1,
    });
    const r2 = await dispatchEmployee({
      tenantId: DOZALDEVS_TENANT_ID,
      slug: 'daily-summarizer',
      dryRun: false,
      prisma: getPrisma(),
      inngest: spy2,
    });

    expect(r1.kind).toBe('dispatched');
    expect(r2.kind).toBe('dispatched');
    if (r1.kind !== 'dispatched' || r2.kind !== 'dispatched') return;

    expect(r1.taskId).not.toBe(r2.taskId);

    const t1 = await getPrisma().task.findUnique({ where: { id: r1.taskId } });
    const t2 = await getPrisma().task.findUnique({ where: { id: r2.taskId } });
    expect(t1!.external_id).not.toBe(t2!.external_id);
    expect(t1!.external_id).toMatch(/^manual-[0-9a-f-]+$/);
    expect(t2!.external_id).toMatch(/^manual-[0-9a-f-]+$/);
  });

  it('status query returns the created task for correct tenant', async () => {
    const spy = makeInngestSpy();
    const result = await dispatchEmployee({
      tenantId: DOZALDEVS_TENANT_ID,
      slug: 'daily-summarizer',
      dryRun: false,
      prisma: getPrisma(),
      inngest: spy,
    });
    expect(result.kind).toBe('dispatched');
    if (result.kind !== 'dispatched') return;

    const task = await getPrisma().task.findFirst({
      where: { id: result.taskId, tenant_id: DOZALDEVS_TENANT_ID },
      select: {
        id: true,
        status: true,
        source_system: true,
        external_id: true,
        archetype_id: true,
      },
    });
    expect(task).not.toBeNull();
    expect(task!.id).toBe(result.taskId);
    expect(task!.source_system).toBe('manual');
    expect(task!.status).toBe('Ready');
  });

  it('cross-tenant status query returns null (tenant isolation enforced)', async () => {
    const spy = makeInngestSpy();
    const result = await dispatchEmployee({
      tenantId: DOZALDEVS_TENANT_ID,
      slug: 'daily-summarizer',
      dryRun: false,
      prisma: getPrisma(),
      inngest: spy,
    });
    expect(result.kind).toBe('dispatched');
    if (result.kind !== 'dispatched') return;

    const OTHER_TENANT = '99999999-9999-9999-9999-999999999999';
    const task = await getPrisma().task.findFirst({
      where: { id: result.taskId, tenant_id: OTHER_TENANT },
    });
    expect(task).toBeNull();
  });
});
