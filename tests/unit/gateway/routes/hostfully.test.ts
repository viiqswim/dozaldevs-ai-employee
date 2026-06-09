import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { hostfullyRoutes } from '../../../../src/gateway/routes/hostfully.js';

const { mockSecretGet, mockCheckLastMessageSender } = vi.hoisted(() => ({
  mockSecretGet: vi.fn().mockResolvedValue(null),
  mockCheckLastMessageSender: vi.fn().mockResolvedValue({ lastSenderIsHost: false }),
}));

vi.mock('../../../../src/repositories/tenant-secret-repository.js', () => ({
  TenantSecretRepository: vi.fn().mockImplementation(() => ({ get: mockSecretGet })),
}));

vi.mock('../../../../src/lib/hostfully-precheck.js', () => ({
  checkLastMessageSender: mockCheckLastMessageSender,
}));

const TENANT_ID = 'tenant-uuid';
const ARCHETYPE_ID = 'archetype-uuid';
const TASK_ID = 'task-uuid';
const AGENCY_UID = 'test-agency-uid';

function makeApp(
  overrides: {
    tenantFindMany?: ReturnType<typeof vi.fn>;
    archetypeFindFirst?: ReturnType<typeof vi.fn>;
    taskCreate?: ReturnType<typeof vi.fn>;
    taskFindFirst?: ReturnType<typeof vi.fn>;
    taskUpdate?: ReturnType<typeof vi.fn>;
    inngestClient?: { send: ReturnType<typeof vi.fn> };
  } = {},
) {
  const app = express();
  app.use(express.json());
  app.use(
    hostfullyRoutes({
      prisma: {
        tenant: {
          findMany:
            overrides.tenantFindMany ??
            vi.fn().mockResolvedValue([
              {
                id: TENANT_ID,
                config: { guest_messaging: { hostfully_agency_uid: AGENCY_UID } },
              },
            ]),
        },
        archetype: {
          findFirst:
            overrides.archetypeFindFirst ?? vi.fn().mockResolvedValue({ id: ARCHETYPE_ID }),
        },
        task: {
          create: overrides.taskCreate ?? vi.fn().mockResolvedValue({ id: TASK_ID }),
          findFirst: overrides.taskFindFirst ?? vi.fn().mockResolvedValue(null),
          update: overrides.taskUpdate ?? vi.fn().mockResolvedValue({}),
        },
      } as never,
      inngestClient: overrides.inngestClient,
    }),
  );
  return app;
}

function makeValidPayload(overrides: Record<string, unknown> = {}) {
  return {
    agency_uid: AGENCY_UID,
    event_type: 'NEW_INBOX_MESSAGE',
    message_uid: 'msg-001',
    thread_uid: 'thread-001',
    lead_uid: 'lead-001',
    property_uid: 'prop-001',
    ...overrides,
  };
}

describe('POST /webhooks/hostfully', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSecretGet.mockResolvedValue(null);
    mockCheckLastMessageSender.mockResolvedValue({ lastSenderIsHost: false });
  });

  it('1. valid NEW_INBOX_MESSAGE → 200 with ok:true and task_id, task.create called with correct fields', async () => {
    const taskCreate = vi.fn().mockResolvedValue({ id: TASK_ID });
    const app = makeApp({ taskCreate });
    const res = await request(app)
      .post('/webhooks/hostfully')
      .set('Content-Type', 'application/json')
      .send(makeValidPayload());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, task_id: TASK_ID });
    expect(taskCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          archetype_id: ARCHETYPE_ID,
          external_id: 'hostfully-msg-msg-001',
          source_system: 'hostfully',
          status: 'Ready',
          tenant_id: TENANT_ID,
          raw_event: {
            thread_uid: 'thread-001',
            message_uid: 'msg-001',
            lead_uid: 'lead-001',
            property_uid: 'prop-001',
          },
        }),
      }),
    );
  });

  it('2. non-NEW_INBOX_MESSAGE event → 200 ignored, no Prisma calls', async () => {
    const tenantFindMany = vi.fn().mockResolvedValue([]);
    const archetypeFindFirst = vi.fn().mockResolvedValue(null);
    const taskCreate = vi.fn();
    const app = makeApp({ tenantFindMany, archetypeFindFirst, taskCreate });
    const res = await request(app)
      .post('/webhooks/hostfully')
      .set('Content-Type', 'application/json')
      .send(makeValidPayload({ event_type: 'BOOKING_CREATED' }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, ignored: true });
    expect(tenantFindMany).not.toHaveBeenCalled();
    expect(archetypeFindFirst).not.toHaveBeenCalled();
    expect(taskCreate).not.toHaveBeenCalled();
  });

  it('3. missing agency_uid → 400 Invalid payload', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/webhooks/hostfully')
      .set('Content-Type', 'application/json')
      .send({ event_type: 'NEW_INBOX_MESSAGE', message_uid: 'msg-001', thread_uid: 'thread-001' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid payload');
  });

  it('4. missing message_uid → 400 Invalid payload', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/webhooks/hostfully')
      .set('Content-Type', 'application/json')
      .send({ agency_uid: AGENCY_UID, event_type: 'NEW_INBOX_MESSAGE', thread_uid: 'thread-001' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid payload');
  });

  it('5. unknown agency_uid → 200 tenant_not_found', async () => {
    const app = makeApp({
      tenantFindMany: vi
        .fn()
        .mockResolvedValue([
          { id: TENANT_ID, config: { guest_messaging: { hostfully_agency_uid: 'other-agency' } } },
        ]),
    });
    const res = await request(app)
      .post('/webhooks/hostfully')
      .set('Content-Type', 'application/json')
      .send(makeValidPayload());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, tenant_not_found: true });
  });

  it('6. duplicate message_uid (P2002) → 200 duplicate', async () => {
    const app = makeApp({
      taskCreate: vi.fn().mockRejectedValue({ code: 'P2002' }),
    });
    const res = await request(app)
      .post('/webhooks/hostfully')
      .set('Content-Type', 'application/json')
      .send(makeValidPayload());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, duplicate: true });
  });

  it('7. archetype not found → 200 archetype_not_found', async () => {
    const app = makeApp({
      archetypeFindFirst: vi.fn().mockResolvedValue(null),
    });
    const res = await request(app)
      .post('/webhooks/hostfully')
      .set('Content-Type', 'application/json')
      .send(makeValidPayload());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, archetype_not_found: true });
  });

  it('8. Inngest send failure → still 200 with task_id (graceful degradation)', async () => {
    const inngestSend = vi.fn().mockRejectedValue(new Error('Inngest unavailable'));
    const app = makeApp({ inngestClient: { send: inngestSend } });
    const res = await request(app)
      .post('/webhooks/hostfully')
      .set('Content-Type', 'application/json')
      .send(makeValidPayload());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, task_id: TASK_ID });
  });

  it('9. no inngest client injected → 200 task created (graceful degradation)', async () => {
    const taskCreate = vi.fn().mockResolvedValue({ id: TASK_ID });
    const app = makeApp({ taskCreate });
    const res = await request(app)
      .post('/webhooks/hostfully')
      .set('Content-Type', 'application/json')
      .send(makeValidPayload());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, task_id: TASK_ID });
    expect(taskCreate).toHaveBeenCalled();
  });

  it('10. Inngest called with correct event name and data', async () => {
    const inngestSend = vi.fn().mockResolvedValue({ ids: ['mock-id'] });
    const app = makeApp({ inngestClient: { send: inngestSend } });
    await request(app)
      .post('/webhooks/hostfully')
      .set('Content-Type', 'application/json')
      .send(makeValidPayload());
    expect(inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'employee/task.dispatched',
        data: { taskId: TASK_ID, archetypeId: ARCHETYPE_ID },
      }),
    );
  });

  it('11. active task for same thread_uid → 200 active_task_exists, no task created', async () => {
    const EXISTING_TASK_ID = 'existing-task-uuid';
    const taskFindFirst = vi
      .fn()
      .mockResolvedValue({ id: EXISTING_TASK_ID, status: 'Executing', metadata: null });
    const taskCreate = vi.fn();
    const app = makeApp({ taskFindFirst, taskCreate });
    const res = await request(app)
      .post('/webhooks/hostfully')
      .set('Content-Type', 'application/json')
      .send(makeValidPayload({ message_uid: 'echo-msg-002' }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      active_task_exists: true,
      existing_task_id: EXISTING_TASK_ID,
    });
    expect(taskCreate).not.toHaveBeenCalled();
  });

  it('12. no active task for thread_uid (findFirst returns null) → task created normally', async () => {
    const taskFindFirst = vi.fn().mockResolvedValue(null);
    const taskCreate = vi.fn().mockResolvedValue({ id: TASK_ID });
    const app = makeApp({ taskFindFirst, taskCreate });
    const res = await request(app)
      .post('/webhooks/hostfully')
      .set('Content-Type', 'application/json')
      .send(makeValidPayload());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, task_id: TASK_ID });
    expect(taskCreate).toHaveBeenCalled();
  });

  it('13. findFirst queries with correct tenant, archetype, non-terminal status filter, and thread_uid path', async () => {
    const taskFindFirst = vi.fn().mockResolvedValue(null);
    const app = makeApp({ taskFindFirst });
    await request(app)
      .post('/webhooks/hostfully')
      .set('Content-Type', 'application/json')
      .send(makeValidPayload({ thread_uid: 'thread-specific-uid' }));
    expect(taskFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          archetype_id: ARCHETYPE_ID,
          status: { notIn: ['Done', 'Failed', 'Cancelled'] },
          raw_event: { path: ['thread_uid'], equals: 'thread-specific-uid' },
        }),
      }),
    );
  });

  it('14. findFirst is always called when thread_uid is present (schema requires it)', async () => {
    const taskFindFirst = vi.fn().mockResolvedValue(null);
    const taskCreate = vi.fn().mockResolvedValue({ id: TASK_ID });
    const app = makeApp({ taskFindFirst, taskCreate });
    const res = await request(app)
      .post('/webhooks/hostfully')
      .set('Content-Type', 'application/json')
      .send(makeValidPayload({ thread_uid: 'any-valid-thread-uid' }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, task_id: TASK_ID });
    expect(taskFindFirst).toHaveBeenCalled();
    expect(taskCreate).toHaveBeenCalled();
  });

  it('15. host-sent message → 200 skipped:host_message, no task created', async () => {
    mockSecretGet.mockResolvedValue('test-hostfully-api-key');
    mockCheckLastMessageSender.mockResolvedValue({ lastSenderIsHost: true });
    const taskCreate = vi.fn();
    const app = makeApp({ taskCreate });
    const res = await request(app)
      .post('/webhooks/hostfully')
      .set('Content-Type', 'application/json')
      .send(makeValidPayload());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, skipped: 'host_message' });
    expect(taskCreate).not.toHaveBeenCalled();
    expect(mockCheckLastMessageSender).toHaveBeenCalledWith('lead-001', 'test-hostfully-api-key');
  });

  it('16. no API key configured → fail-open, task created normally', async () => {
    mockSecretGet.mockResolvedValue(null);
    const taskCreate = vi.fn().mockResolvedValue({ id: TASK_ID });
    const app = makeApp({ taskCreate });
    const res = await request(app)
      .post('/webhooks/hostfully')
      .set('Content-Type', 'application/json')
      .send(makeValidPayload());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, task_id: TASK_ID });
    expect(mockCheckLastMessageSender).not.toHaveBeenCalled();
    expect(taskCreate).toHaveBeenCalled();
  });
});
