import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { getPrisma, disconnectPrisma } from '../setup.js';
import { dispatchEmployee } from '../../src/gateway/services/employee-dispatcher.js';
import type { InngestLike } from '../../src/gateway/server.js';

const VLRE_TENANT_ID = '00000000-0000-0000-0000-000000000003';
const GUEST_MESSAGING_ARCHETYPE_ID = '00000000-0000-0000-0000-000000000015';

afterAll(async () => {
  await disconnectPrisma();
});

describe('guest-messaging archetype — seed verification', () => {
  it('archetype record exists', async () => {
    const prisma = getPrisma();
    const result = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM archetypes WHERE id = ${GUEST_MESSAGING_ARCHETYPE_ID}::uuid
    `;
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(GUEST_MESSAGING_ARCHETYPE_ID);
  });

  it('role_name = guest-messaging', async () => {
    const prisma = getPrisma();
    const result = await prisma.$queryRaw<Array<{ role_name: string }>>`
      SELECT role_name FROM archetypes WHERE id = ${GUEST_MESSAGING_ARCHETYPE_ID}::uuid
    `;
    expect(result[0].role_name).toBe('guest-messaging');
  });

  it('model = minimax/minimax-m2.7', async () => {
    const prisma = getPrisma();
    const result = await prisma.$queryRaw<Array<{ model: string }>>`
      SELECT model FROM archetypes WHERE id = ${GUEST_MESSAGING_ARCHETYPE_ID}::uuid
    `;
    expect(result[0].model).toBe('minimax/minimax-m2.7');
  });

  it('runtime = opencode', async () => {
    const prisma = getPrisma();
    const result = await prisma.$queryRaw<Array<{ runtime: string }>>`
      SELECT runtime FROM archetypes WHERE id = ${GUEST_MESSAGING_ARCHETYPE_ID}::uuid
    `;
    expect(result[0].runtime).toBe('opencode');
  });

  it('tenant_id = VLRE tenant', async () => {
    const prisma = getPrisma();
    const result = await prisma.$queryRaw<Array<{ tenant_id: string }>>`
      SELECT tenant_id FROM archetypes WHERE id = ${GUEST_MESSAGING_ARCHETYPE_ID}::uuid
    `;
    expect(result[0].tenant_id).toBe(VLRE_TENANT_ID);
  });

  it('risk_model has approval_required: true', async () => {
    const prisma = getPrisma();
    const result = await prisma.$queryRaw<Array<{ approval_required: boolean }>>`
      SELECT (risk_model->>'approval_required')::boolean AS approval_required
      FROM archetypes WHERE id = ${GUEST_MESSAGING_ARCHETYPE_ID}::uuid
    `;
    expect(result[0].approval_required).toBe(true);
  });

  it('system_prompt is a non-empty string', async () => {
    const prisma = getPrisma();
    const result = await prisma.$queryRaw<Array<{ system_prompt: string | null }>>`
      SELECT system_prompt FROM archetypes WHERE id = ${GUEST_MESSAGING_ARCHETYPE_ID}::uuid
    `;
    expect(result[0].system_prompt).not.toBeNull();
    expect((result[0].system_prompt as string).length).toBeGreaterThan(0);
    expect(result[0].system_prompt).toContain('NEEDS_APPROVAL');
    expect(result[0].system_prompt).toContain('NO_ACTION_NEEDED');
    expect(result[0].system_prompt).toContain('confidence');
    expect(result[0].system_prompt).toContain('draftResponse');
    expect(result[0].system_prompt).toContain('urgency');
    expect(result[0].system_prompt).toContain('category');
    expect(result[0].system_prompt).not.toContain('to be defined in GM-02');
  });

  it('instructions is a non-empty string', async () => {
    const prisma = getPrisma();
    const result = await prisma.$queryRaw<Array<{ instructions: string | null }>>`
      SELECT instructions FROM archetypes WHERE id = ${GUEST_MESSAGING_ARCHETYPE_ID}::uuid
    `;
    expect(result[0].instructions).not.toBeNull();
    expect((result[0].instructions as string).length).toBeGreaterThan(0);
    expect(result[0].instructions).toContain('get-messages.ts');
    expect(result[0].instructions).toContain('get-property.ts');
    expect(result[0].instructions).toContain('/tmp/summary.txt');
    expect(result[0].instructions).toContain('/tmp/approval-message.json');
    expect(result[0].instructions).toContain('DELIVERY_MODE');
    expect(result[0].instructions).not.toContain('to be defined in GM-02');
  });

  it('agents_md is a non-empty string', async () => {
    const prisma = getPrisma();
    const result = await prisma.$queryRaw<Array<{ agents_md: string | null }>>`
      SELECT agents_md FROM archetypes WHERE id = ${GUEST_MESSAGING_ARCHETYPE_ID}::uuid
    `;
    expect(result[0].agents_md).not.toBeNull();
    expect((result[0].agents_md as string).length).toBeGreaterThan(0);
  });

  it('deliverable_type = slack_message', async () => {
    const prisma = getPrisma();
    const result = await prisma.$queryRaw<Array<{ deliverable_type: string }>>`
      SELECT deliverable_type FROM archetypes WHERE id = ${GUEST_MESSAGING_ARCHETYPE_ID}::uuid
    `;
    expect(result[0].deliverable_type).toBe('slack_message');
  });

  it('concurrency_limit = 5', async () => {
    const prisma = getPrisma();
    const result = await prisma.$queryRaw<Array<{ concurrency_limit: number }>>`
      SELECT concurrency_limit FROM archetypes WHERE id = ${GUEST_MESSAGING_ARCHETYPE_ID}::uuid
    `;
    expect(result[0].concurrency_limit).toBe(5);
  });

  it('tool_registry contains expected Hostfully and platform tools', async () => {
    const prisma = getPrisma();
    const result = await prisma.$queryRaw<Array<{ tool_registry: unknown }>>`
      SELECT tool_registry FROM archetypes WHERE id = ${GUEST_MESSAGING_ARCHETYPE_ID}::uuid
    `;
    const registry = result[0].tool_registry as { tools: string[] };
    expect(Array.isArray(registry.tools)).toBe(true);

    const expectedTools = [
      '/tools/hostfully/get-property.ts',
      '/tools/hostfully/get-reservations.ts',
      '/tools/hostfully/get-messages.ts',
      '/tools/hostfully/send-message.ts',
      '/tools/slack/post-message.ts',
      '/tools/slack/read-channels.ts',
      '/tools/platform/report-issue.ts',
    ];
    for (const tool of expectedTools) {
      expect(registry.tools).toContain(tool);
    }
  });
});

let integrationPrisma: PrismaClient;

function makeInngestSpy(): InngestLike {
  return { send: vi.fn().mockResolvedValue({ ids: ['mock-event-id'] }) };
}

beforeAll(async () => {
  integrationPrisma = new PrismaClient();
  const archetype = await integrationPrisma.archetype.findFirst({
    where: { tenant_id: VLRE_TENANT_ID, role_name: 'guest-messaging' },
  });
  if (!archetype) {
    throw new Error('guest-messaging archetype not found — run pnpm prisma db seed first');
  }
});

afterAll(async () => {
  await integrationPrisma.$disconnect();
});

describe('guest-messaging employee trigger — integration', () => {
  beforeEach(async () => {
    await integrationPrisma.task.deleteMany({
      where: {
        source_system: 'manual',
        tenant_id: VLRE_TENANT_ID,
        external_id: { startsWith: 'manual-' },
      },
    });
  }, 30000);
  it('dry-run returns { kind: dry_run } with correct archetypeId', async () => {
    const spy = makeInngestSpy();
    const result = await dispatchEmployee({
      tenantId: VLRE_TENANT_ID,
      slug: 'guest-messaging',
      dryRun: true,
      prisma: integrationPrisma,
      inngest: spy,
    });

    expect(result.kind).toBe('dry_run');
    if (result.kind !== 'dry_run') return;
    expect(result.archetypeId).toBe(GUEST_MESSAGING_ARCHETYPE_ID);
    expect(spy.send).not.toHaveBeenCalled();
  });

  it('dry-run creates no DB row', async () => {
    const spy = makeInngestSpy();
    const countBefore = await integrationPrisma.task.count({
      where: { source_system: 'manual', tenant_id: VLRE_TENANT_ID },
    });

    await dispatchEmployee({
      tenantId: VLRE_TENANT_ID,
      slug: 'guest-messaging',
      dryRun: true,
      prisma: integrationPrisma,
      inngest: spy,
    });

    const countAfter = await integrationPrisma.task.count({
      where: { source_system: 'manual', tenant_id: VLRE_TENANT_ID },
    });
    expect(countAfter).toBe(countBefore);
  });

  it('real dispatch creates DB row with source_system=manual, status=Ready, tenant_id=VLRE', async () => {
    const spy = makeInngestSpy();
    const result = await dispatchEmployee({
      tenantId: VLRE_TENANT_ID,
      slug: 'guest-messaging',
      dryRun: false,
      prisma: integrationPrisma,
      inngest: spy,
    });

    expect(result.kind).toBe('dispatched');
    if (result.kind !== 'dispatched') return;

    const task = await integrationPrisma.task.findUnique({ where: { id: result.taskId } });
    expect(task).not.toBeNull();
    expect(task!.source_system).toBe('manual');
    expect(task!.status).toBe('Ready');
    expect(task!.tenant_id).toBe(VLRE_TENANT_ID);
    expect(task!.external_id).toMatch(/^manual-/);
  });

  it('real dispatch fires Inngest event with correct name and archetypeId', async () => {
    const spy = makeInngestSpy();
    const result = await dispatchEmployee({
      tenantId: VLRE_TENANT_ID,
      slug: 'guest-messaging',
      dryRun: false,
      prisma: integrationPrisma,
      inngest: spy,
    });

    expect(result.kind).toBe('dispatched');
    if (result.kind !== 'dispatched') return;

    expect(spy.send).toHaveBeenCalledOnce();
    const sendArg = (spy.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sendArg.name).toBe('employee/task.dispatched');
    expect(sendArg.data.taskId).toBe(result.taskId);
    expect(sendArg.data.archetypeId).toBe(GUEST_MESSAGING_ARCHETYPE_ID);
  });
});
