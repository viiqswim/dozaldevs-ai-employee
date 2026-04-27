import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  TestApp,
  createTestApp,
  getPrisma,
  disconnectPrisma,
  inngestMock,
  ADMIN_TEST_KEY,
} from '../setup.js';

const VLRE_TENANT_ID = '00000000-0000-0000-0000-000000000003';
const GUEST_MESSAGING_ARCHETYPE_ID = '00000000-0000-0000-0000-000000000015';

let app: TestApp;

beforeAll(async () => {
  const prisma = getPrisma();
  const archetype = await prisma.archetype.findFirst({
    where: { tenant_id: VLRE_TENANT_ID, role_name: 'guest-messaging' },
  });
  if (!archetype) {
    throw new Error('guest-messaging archetype not found — run pnpm prisma db seed first');
  }
  app = await createTestApp({ inngest: inngestMock });
});

afterAll(async () => {
  await app.close();
  await disconnectPrisma();
});

beforeEach(async () => {
  await getPrisma().task.deleteMany({
    where: {
      source_system: 'manual',
      tenant_id: VLRE_TENANT_ID,
      external_id: { startsWith: 'manual-' },
    },
  });
});

describe('guest-messaging classification pipeline — API integration', () => {
  it('POST /trigger returns 202 with task_id and status_url', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${VLRE_TENANT_ID}/employees/guest-messaging/trigger`,
      headers: {
        'x-admin-key': ADMIN_TEST_KEY,
        'content-type': 'application/json',
      },
      payload: {},
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body) as { task_id: string; status_url: string };
    expect(body).toHaveProperty('task_id');
    expect(body).toHaveProperty('status_url');
    expect(typeof body.task_id).toBe('string');
    expect(body.task_id.length).toBeGreaterThan(0);
  });

  it('dry-run returns archetype_id 00000000-0000-0000-0000-000000000015', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${VLRE_TENANT_ID}/employees/guest-messaging/trigger?dry_run=true`,
      headers: {
        'x-admin-key': ADMIN_TEST_KEY,
        'content-type': 'application/json',
      },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { archetype_id: string; valid: boolean };
    expect(body.archetype_id).toBe(GUEST_MESSAGING_ARCHETYPE_ID);
    expect(body.valid).toBe(true);
  });

  it('GET /tasks/:id returns task with correct archetype_id and initial status', async () => {
    const triggerRes = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${VLRE_TENANT_ID}/employees/guest-messaging/trigger`,
      headers: {
        'x-admin-key': ADMIN_TEST_KEY,
        'content-type': 'application/json',
      },
      payload: {},
    });

    expect(triggerRes.statusCode).toBe(202);
    const { task_id } = JSON.parse(triggerRes.body) as { task_id: string };

    const statusRes = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${VLRE_TENANT_ID}/tasks/${task_id}`,
      headers: {
        'x-admin-key': ADMIN_TEST_KEY,
      },
    });

    expect(statusRes.statusCode).toBe(200);
    const task = JSON.parse(statusRes.body) as {
      id: string;
      archetype_id: string;
      status: string;
      source_system: string;
    };
    expect(task.id).toBe(task_id);
    expect(task.archetype_id).toBe(GUEST_MESSAGING_ARCHETYPE_ID);
    expect(['Ready', 'Executing', 'Submitting', 'Reviewing', 'Done']).toContain(task.status);
    expect(task.source_system).toBe('manual');
  });

  it('guest-messaging archetype system_prompt contains all required classification fields', async () => {
    const prisma = getPrisma();
    const archetype = await prisma.archetype.findUnique({
      where: { id: GUEST_MESSAGING_ARCHETYPE_ID },
    });

    expect(archetype).not.toBeNull();
    const systemPrompt = archetype!.system_prompt ?? '';

    expect(systemPrompt).toContain('"classification"');
    expect(systemPrompt).toContain('NEEDS_APPROVAL');
    expect(systemPrompt).toContain('NO_ACTION_NEEDED');
    expect(systemPrompt).toContain('"confidence"');
    expect(systemPrompt).toContain('"draftResponse"');
    expect(systemPrompt).toContain('"conversationSummary"');
    expect(systemPrompt).toContain('"urgency"');
    expect(systemPrompt).toContain('"category"');
  });
});
