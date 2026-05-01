import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import express from 'express';
import { TestApp, getPrisma, disconnectPrisma, ADMIN_TEST_KEY } from '../setup.js';
import { adminPropertyLockRoutes } from '../../src/gateway/routes/admin-property-locks.js';

const VLRE_TENANT = '00000000-0000-0000-0000-000000000003';

const VALID_CREATE_BODY = {
  property_external_id: 'integ-prop-ext-001',
  lock_external_id: 'integ-lock-ext-001',
  lock_name: 'Integration Front Door',
  property_type: 'HOME',
  property_name: 'Integration Test Property',
};

let app: TestApp;

beforeEach(async () => {
  process.env.ADMIN_API_KEY = ADMIN_TEST_KEY;
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use(adminPropertyLockRoutes({ prisma: getPrisma() }));
  app = new TestApp(expressApp);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await getPrisma().propertyLock.deleteMany({ where: { tenant_id: VLRE_TENANT } });
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('POST /admin/tenants/:tenantId/property-locks — integration', () => {
  it('1. creates mapping via POST → 201, record exists in DB with correct tenant_id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${VLRE_TENANT}/property-locks`,
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_TEST_KEY },
      payload: VALID_CREATE_BODY,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBeTruthy();
    expect(body.tenant_id).toBe(VLRE_TENANT);
    expect(body.property_external_id).toBe('integ-prop-ext-001');
    expect(body.lock_external_id).toBe('integ-lock-ext-001');
    expect(body.lock_name).toBe('Integration Front Door');
    expect(body.lock_provider).toBe('sifely');

    const record = await getPrisma().propertyLock.findUnique({ where: { id: body.id } });
    expect(record).not.toBeNull();
    expect(record!.tenant_id).toBe(VLRE_TENANT);
    expect(record!.lock_name).toBe('Integration Front Door');
  });
});

describe('GET /admin/tenants/:tenantId/property-locks — integration', () => {
  it('2. created mapping appears in GET list with optional property_id filter', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${VLRE_TENANT}/property-locks`,
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_TEST_KEY },
      payload: VALID_CREATE_BODY,
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);

    const listRes = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${VLRE_TENANT}/property-locks`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(Array.isArray(listBody.propertyLocks)).toBe(true);
    const ids = listBody.propertyLocks.map((l: { id: string }) => l.id);
    expect(ids).toContain(created.id);

    const filteredRes = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${VLRE_TENANT}/property-locks?property_id=integ-prop-ext-001`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(filteredRes.statusCode).toBe(200);
    const filteredBody = JSON.parse(filteredRes.body);
    expect(filteredBody.propertyLocks.length).toBeGreaterThanOrEqual(1);
    for (const lock of filteredBody.propertyLocks) {
      expect(lock.property_external_id).toBe('integ-prop-ext-001');
    }
  });
});

describe('PATCH /admin/tenants/:tenantId/property-locks/:lockId — integration', () => {
  it('3. updates mapping via PATCH → 200, DB record reflects new values', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${VLRE_TENANT}/property-locks`,
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_TEST_KEY },
      payload: VALID_CREATE_BODY,
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/admin/tenants/${VLRE_TENANT}/property-locks/${created.id}`,
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_TEST_KEY },
      payload: { lock_name: 'Updated Lock Name', passcode_name: 'permanent-visitor-home' },
    });
    expect(patchRes.statusCode).toBe(200);
    const patched = JSON.parse(patchRes.body);
    expect(patched.lock_name).toBe('Updated Lock Name');
    expect(patched.passcode_name).toBe('permanent-visitor-home');

    const record = await getPrisma().propertyLock.findUnique({ where: { id: created.id } });
    expect(record!.lock_name).toBe('Updated Lock Name');
    expect(record!.passcode_name).toBe('permanent-visitor-home');
  });
});

describe('DELETE /admin/tenants/:tenantId/property-locks/:lockId — integration', () => {
  it('4. deletes mapping via DELETE → 204, record gone from DB', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${VLRE_TENANT}/property-locks`,
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_TEST_KEY },
      payload: VALID_CREATE_BODY,
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${VLRE_TENANT}/property-locks/${created.id}`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(deleteRes.statusCode).toBe(204);
    expect(deleteRes.body).toBe('');

    const record = await getPrisma().propertyLock.findUnique({ where: { id: created.id } });
    expect(record).toBeNull();

    const getRes = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${VLRE_TENANT}/property-locks/${created.id}`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(getRes.statusCode).toBe(404);
  });
});
