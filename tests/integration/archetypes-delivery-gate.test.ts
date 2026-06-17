import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import express from 'express';
import { TestApp, getPrisma, disconnectPrisma, ADMIN_TEST_KEY } from '../setup.js';
import { adminArchetypesRoutes } from '../../src/gateway/routes/admin-archetypes.js';

vi.mock('../../src/gateway/services/time-estimator.js', () => ({
  TimeEstimator: vi.fn().mockImplementation(() => ({
    estimate: vi.fn().mockResolvedValue(null),
  })),
  shouldReEstimate: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/lib/call-llm.js', () => ({
  callLLM: vi.fn(),
}));

const SEEDED_DOZALDEVS_TENANT_ID = '00000000-0000-0000-0000-000000000002';
const TEST_ROLE_PREFIX = 'gate-test-';

let app: TestApp;

async function cleanupGateArchetypes(): Promise<void> {
  const prisma = getPrisma();
  // edit-history holds an onDelete:Restrict FK — delete children before parents.
  await prisma.archetypeEditHistory.deleteMany({
    where: { archetype: { role_name: { startsWith: TEST_ROLE_PREFIX } } },
  });
  await prisma.archetype.deleteMany({
    where: { tenant_id: SEEDED_DOZALDEVS_TENANT_ID, role_name: { startsWith: TEST_ROLE_PREFIX } },
  });
}

beforeEach(async () => {
  process.env.SERVICE_TOKEN = ADMIN_TEST_KEY;

  await cleanupGateArchetypes();

  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use(adminArchetypesRoutes({ prisma: getPrisma() }));
  app = new TestApp(expressApp);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await cleanupGateArchetypes();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('POST /admin/tenants/:tenantId/archetypes — delivery hard-gate', () => {
  it('(a) REJECT — deliverable_type set + empty delivery_steps → 400 MISSING_DELIVERY_CONFIG', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${SEEDED_DOZALDEVS_TENANT_ID}/archetypes`,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ADMIN_TEST_KEY}`,
      },
      payload: {
        role_name: `${TEST_ROLE_PREFIX}reject`,
        model: 'deepseek/deepseek-v4-flash',
        runtime: 'opencode',
        instructions: 'Produce the deliverable.',
        deliverable_type: 'slack_message',
        delivery_steps: '',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('MISSING_DELIVERY_CONFIG');
  });

  it('(b) ESCAPE HATCH — deliverable_type null + empty delivery_steps → 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${SEEDED_DOZALDEVS_TENANT_ID}/archetypes`,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ADMIN_TEST_KEY}`,
      },
      payload: {
        role_name: `${TEST_ROLE_PREFIX}escape-hatch`,
        model: 'deepseek/deepseek-v4-flash',
        runtime: 'opencode',
        instructions: 'Do the work and act in-place; no separate delivery needed.',
        deliverable_type: null,
        delivery_steps: '',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBeTruthy();
    expect(body.deliverable_type).toBeNull();
  });

  it('(d) VALID — deliverable_type set + non-empty delivery_steps → 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${SEEDED_DOZALDEVS_TENANT_ID}/archetypes`,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ADMIN_TEST_KEY}`,
      },
      payload: {
        role_name: `${TEST_ROLE_PREFIX}valid`,
        model: 'deepseek/deepseek-v4-flash',
        runtime: 'opencode',
        instructions: 'Produce the deliverable.',
        deliverable_type: 'slack_message',
        delivery_steps: 'Release the finished deliverable to the configured destination.',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBeTruthy();
    expect(body.delivery_steps).toBe(
      'Release the finished deliverable to the configured destination.',
    );
  });

  it('(e) REJECT — deliverable_type null + empty delivery_steps → 400 MISSING_DELIVERY_CONFIG (null/null loophole)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${SEEDED_DOZALDEVS_TENANT_ID}/archetypes`,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ADMIN_TEST_KEY}`,
      },
      payload: {
        role_name: `${TEST_ROLE_PREFIX}null-null-reject`,
        model: 'deepseek/deepseek-v4-flash',
        runtime: 'opencode',
        instructions: 'Do the work; no delivery configured at all.',
        deliverable_type: null,
        delivery_steps: '',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('MISSING_DELIVERY_CONFIG');
  });
});

describe('PATCH /admin/tenants/:tenantId/archetypes/:archetypeId — delivery hard-gate', () => {
  it('(c) PATCH REJECT — set deliverable_type with empty delivery_steps → 400 MISSING_DELIVERY_CONFIG', async () => {
    const prisma = getPrisma();
    const seeded = await prisma.archetype.create({
      data: {
        tenant_id: SEEDED_DOZALDEVS_TENANT_ID,
        role_name: `${TEST_ROLE_PREFIX}patch-seed`,
        model: 'deepseek/deepseek-v4-flash',
        runtime: 'opencode',
        status: 'draft',
        deliverable_type: null,
        delivery_steps: 'Release the finished deliverable to the configured destination.',
      },
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/tenants/${SEEDED_DOZALDEVS_TENANT_ID}/archetypes/${seeded.id}`,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ADMIN_TEST_KEY}`,
      },
      payload: {
        deliverable_type: 'slack_message',
        delivery_steps: '',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('MISSING_DELIVERY_CONFIG');
  });
});
