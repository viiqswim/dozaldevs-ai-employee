import { describe, it, expect, beforeAll, afterEach, afterAll, vi, beforeEach } from 'vitest';
import {
  TestApp,
  createTestApp,
  inngestMock,
  getPrisma,
  cleanupTestData,
  disconnectPrisma,
} from '../setup.js';

const VLRE_TENANT_ID = '00000000-0000-0000-0000-000000000003';
const VLRE_AGENCY_UID = '942d08d9-82bb-4fd3-9091-ca0c6b50b578';

const VALID_PAYLOAD = {
  agency_uid: VLRE_AGENCY_UID,
  event_type: 'NEW_INBOX_MESSAGE',
  message_uid: 'test-msg-001',
  thread_uid: 'test-thread-001',
  lead_uid: 'lead-001',
  property_uid: 'prop-001',
};

let app: TestApp;

beforeAll(async () => {
  const tenant = await getPrisma().tenant.findUnique({ where: { id: VLRE_TENANT_ID } });
  if (tenant) {
    const existingConfig = (tenant.config as Record<string, unknown>) ?? {};
    await getPrisma().tenant.update({
      where: { id: VLRE_TENANT_ID },
      data: {
        config: {
          ...existingConfig,
          guest_messaging: {
            ...((existingConfig['guest_messaging'] as Record<string, unknown>) ?? {}),
            hostfully_agency_uid: VLRE_AGENCY_UID,
          },
        },
      },
    });
  }
});

beforeEach(async () => {
  app = await createTestApp({ inngest: inngestMock });
});

afterEach(async () => {
  await app.close();
  await cleanupTestData();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('POST /webhooks/hostfully', () => {
  it('happy path: valid payload → 200 with ok and task_id, correct DB row', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/hostfully',
      headers: { 'content-type': 'application/json' },
      payload: VALID_PAYLOAD,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.ok).toBe(true);
    expect(json.task_id).toBeTruthy();

    const task = await getPrisma().task.findUnique({ where: { id: json.task_id } });
    expect(task).not.toBeNull();
    expect(task!.external_id).toBe('hostfully-msg-test-msg-001');
    expect(task!.source_system).toBe('hostfully');
    expect(task!.status).toBe('Ready');
  });

  it('dedup: second identical request → deduplicated (active_task_exists or duplicate), only 1 task row in DB', async () => {
    const firstRes = await app.inject({
      method: 'POST',
      url: '/webhooks/hostfully',
      headers: { 'content-type': 'application/json' },
      payload: VALID_PAYLOAD,
    });

    const firstJson = JSON.parse(firstRes.body);
    expect(firstJson.ok).toBe(true);
    expect(firstJson.task_id).toBeTruthy();

    const secondRes = await app.inject({
      method: 'POST',
      url: '/webhooks/hostfully',
      headers: { 'content-type': 'application/json' },
      payload: VALID_PAYLOAD,
    });

    expect(secondRes.statusCode).toBe(200);
    const secondJson = JSON.parse(secondRes.body);
    expect(secondJson.ok).toBe(true);
    // Thread-level dedup fires first (active_task_exists) for same thread;
    // message-level dedup (duplicate) fires as fallback for same message_uid.
    expect(secondJson.active_task_exists ?? secondJson.duplicate).toBe(true);

    const count = await getPrisma().task.count({
      where: { external_id: 'hostfully-msg-test-msg-001' },
    });
    expect(count).toBe(1);
  });

  it('Inngest: send called with employee/task.dispatched and matching taskId', async () => {
    const sendSpy = vi.spyOn(inngestMock, 'send');

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/hostfully',
      headers: { 'content-type': 'application/json' },
      payload: VALID_PAYLOAD,
    });

    const json = JSON.parse(res.body);
    expect(json.ok).toBe(true);

    expect(sendSpy).toHaveBeenCalledOnce();
    const sentEvent = sendSpy.mock.calls[0][0] as { name: string; data: { taskId: string } };
    expect(sentEvent.name).toBe('employee/task.dispatched');
    expect(sentEvent.data.taskId).toBe(json.task_id);
  });

  it('unknown agency_uid → 200 with tenant_not_found: true, 0 tasks in DB', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/hostfully',
      headers: { 'content-type': 'application/json' },
      payload: {
        ...VALID_PAYLOAD,
        agency_uid: 'unknown-agency-xyz',
      },
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.ok).toBe(true);
    expect(json.tenant_not_found).toBe(true);

    const count = await getPrisma().task.count();
    expect(count).toBe(0);
  });
});
