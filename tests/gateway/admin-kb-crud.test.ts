import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import express from 'express';
import { TestApp, getPrisma, cleanupTestData, disconnectPrisma, ADMIN_TEST_KEY } from '../setup.js';
import { adminKbRoutes } from '../../src/gateway/routes/admin-kb.js';

const VLRE_TENANT = '00000000-0000-0000-0000-000000000003';
const DOZALDEVS_TENANT = '00000000-0000-0000-0000-000000000002';

// Seeded entry IDs — do NOT mutate
const SEED_COMMON_ID = '00000000-0000-0000-0000-000000000100';
const SEED_ENTITY_ID = '00000000-0000-0000-0000-000000000101';

// The entity_type+entity_id for the seeded entity entry (used for duplicate tests)
const SEED_ENTITY_TYPE = 'property';
const SEED_ENTITY_ENTITY_ID = 'c960c8d2-9a51-49d8-bb48-355a7bfbe7e2';

// A non-existent UUID — won't be in the DB, safe for 404 tests
const NONEXISTENT_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
// A UUID for a tenant with no KB entries
const EMPTY_TENANT_UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

let app: TestApp;

beforeEach(async () => {
  process.env.ADMIN_API_KEY = ADMIN_TEST_KEY;
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use(adminKbRoutes({ prisma: getPrisma() }));
  app = new TestApp(expressApp);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await cleanupTestData();
});

afterAll(async () => {
  await disconnectPrisma();
});

// ─── POST /admin/tenants/:tenantId/kb/entries ─────────────────────────────────

describe('POST /admin/tenants/:tenantId/kb/entries', () => {
  it('1. creates entity-scoped entry with entity_type + entity_id → 201, scope=entity', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries`,
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_TEST_KEY },
      payload: {
        entity_type: 'property',
        entity_id: 'new-test-property-unique',
        content: 'This is a new entity-scoped KB entry for testing.',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBeTruthy();
    expect(body.scope).toBe('entity');
    expect(body.entity_type).toBe('property');
    expect(body.entity_id).toBe('new-test-property-unique');
    expect(body.tenant_id).toBe(VLRE_TENANT);
    expect(body.content).toBe('This is a new entity-scoped KB entry for testing.');
  });

  it('2. creates common-scoped entry (content only, no entity) → 201, scope=common, entity_type=null, entity_id=null', async () => {
    // VLRE already has a common entry — use DozalDevs (no common entry there)
    const res = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${DOZALDEVS_TENANT}/kb/entries`,
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_TEST_KEY },
      payload: {
        content: 'General policies for DozalDevs tenant.',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBeTruthy();
    expect(body.scope).toBe('common');
    expect(body.entity_type).toBeNull();
    expect(body.entity_id).toBeNull();
    expect(body.tenant_id).toBe(DOZALDEVS_TENANT);
  });

  it('3. creates with empty content string → 400 INVALID_REQUEST', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries`,
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_TEST_KEY },
      payload: { content: '' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('INVALID_REQUEST');
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it('4. creates with entity_id but missing entity_type → 400 INVALID_REQUEST', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries`,
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_TEST_KEY },
      payload: { entity_id: 'some-property-id', content: 'Some content here.' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('5. duplicate entity entry (same tenant+entity_type+entity_id as seeded 0101) → 409 CONFLICT', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries`,
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_TEST_KEY },
      payload: {
        entity_type: SEED_ENTITY_TYPE,
        entity_id: SEED_ENTITY_ENTITY_ID,
        content: 'Duplicate entity entry attempt.',
      },
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('CONFLICT');
    expect(typeof body.message).toBe('string');
  });

  it('6. duplicate common entry (VLRE already has seeded 0100 common entry) → 409 CONFLICT', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries`,
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_TEST_KEY },
      payload: { content: 'Another common entry attempt for VLRE.' },
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('CONFLICT');
    expect(typeof body.message).toBe('string');
  });

  it('7. invalid tenant UUID → 400 INVALID_ID', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/tenants/not-a-valid-uuid/kb/entries',
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_TEST_KEY },
      payload: { content: 'Some content.' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('INVALID_ID');
  });

  it('8. missing X-Admin-Key header → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries`,
      headers: { 'content-type': 'application/json' },
      payload: { content: 'Some content.' },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Unauthorized');
  });
});

// ─── GET /admin/tenants/:tenantId/kb/entries ──────────────────────────────────

describe('GET /admin/tenants/:tenantId/kb/entries', () => {
  it('9. lists all entries for VLRE tenant → 200, returns array including seeded entries', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.entries.length).toBeGreaterThanOrEqual(4);
    const ids = body.entries.map((e: { id: string }) => e.id);
    expect(ids).toContain(SEED_COMMON_ID);
    expect(ids).toContain(SEED_ENTITY_ID);
  });

  it('10. list with ?entity_type=property filter → 200, only property entries', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries?entity_type=property`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.entries.length).toBeGreaterThanOrEqual(3);
    for (const entry of body.entries) {
      expect(entry.entity_type).toBe('property');
    }
  });

  it('11. list with ?entity_type=property&entity_id=<seeded-id> → 200, returns exactly 1 entry', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries?entity_type=property&entity_id=${SEED_ENTITY_ENTITY_ID}`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].id).toBe(SEED_ENTITY_ID);
  });

  it('12. list for tenant with no entries → 200, returns empty array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${EMPTY_TENANT_UUID}/kb/entries`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.entries).toHaveLength(0);
  });

  it('13. list with invalid tenant UUID → 400 INVALID_ID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/tenants/not-a-uuid/kb/entries',
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('INVALID_ID');
  });
});

// ─── GET /admin/tenants/:tenantId/kb/entries/:entryId ────────────────────────

describe('GET /admin/tenants/:tenantId/kb/entries/:entryId', () => {
  it('14. get existing seeded entry by ID → 200, returns full entry', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries/${SEED_COMMON_ID}`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(SEED_COMMON_ID);
    expect(body.scope).toBe('common');
    expect(body.tenant_id).toBe(VLRE_TENANT);
    expect(body.content).toBeTruthy();
  });

  it('15. get non-existent entry → 404 NOT_FOUND', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries/${NONEXISTENT_UUID}`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('NOT_FOUND');
  });

  it('16. cross-tenant isolation: get VLRE entry using DozalDevs tenant → 404 NOT_FOUND', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${DOZALDEVS_TENANT}/kb/entries/${SEED_ENTITY_ID}`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('NOT_FOUND');
  });

  it('17. get with invalid UUID → 400 INVALID_ID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries/not-a-valid-uuid`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('INVALID_ID');
  });
});

// ─── PATCH /admin/tenants/:tenantId/kb/entries/:entryId ──────────────────────

describe('PATCH /admin/tenants/:tenantId/kb/entries/:entryId', () => {
  it('18. updates content of seeded entry → 200, response has new content', async () => {
    // Create a fresh entry so we don't mutate seeded entry
    const createRes = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries`,
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_TEST_KEY },
      payload: {
        entity_type: 'property',
        entity_id: 'patch-test-property',
        content: 'Original content for patch test.',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries/${created.id}`,
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_TEST_KEY },
      payload: { content: 'Updated content after patch.' },
    });
    expect(patchRes.statusCode).toBe(200);
    const body = JSON.parse(patchRes.body);
    expect(body.id).toBe(created.id);
    expect(body.content).toBe('Updated content after patch.');
  });

  it('19. update non-existent entry → 404 NOT_FOUND', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries/${NONEXISTENT_UUID}`,
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_TEST_KEY },
      payload: { content: 'Updated content.' },
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('NOT_FOUND');
  });

  it('20. update with empty content → 400 INVALID_REQUEST', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries/${SEED_ENTITY_ID}`,
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_TEST_KEY },
      payload: { content: '' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('INVALID_REQUEST');
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it('21. cross-tenant isolation: update VLRE entry using DozalDevs tenant → 404 NOT_FOUND', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries`,
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_TEST_KEY },
      payload: {
        entity_type: 'property',
        entity_id: 'cross-tenant-patch-test',
        content: 'Entry created for cross-tenant PATCH test.',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/admin/tenants/${DOZALDEVS_TENANT}/kb/entries/${created.id}`,
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_TEST_KEY },
      payload: { content: 'Should not be updated.' },
    });
    expect(patchRes.statusCode).toBe(404);
    const body = JSON.parse(patchRes.body);
    expect(body.error).toBe('NOT_FOUND');
  });
});

// ─── DELETE /admin/tenants/:tenantId/kb/entries/:entryId ─────────────────────

describe('DELETE /admin/tenants/:tenantId/kb/entries/:entryId', () => {
  it('22. deletes existing entry → 204 (no body)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries`,
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_TEST_KEY },
      payload: {
        entity_type: 'property',
        entity_id: 'delete-test-property',
        content: 'Entry to be deleted.',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries/${created.id}`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(deleteRes.statusCode).toBe(204);
    expect(deleteRes.body).toBe('');
  });

  it('23. verify deleted entry is gone: GET after DELETE → 404', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries`,
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_TEST_KEY },
      payload: {
        entity_type: 'property',
        entity_id: 'verify-delete-property',
        content: 'Entry to verify deletion.',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);

    await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries/${created.id}`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });

    const getRes = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries/${created.id}`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(getRes.statusCode).toBe(404);
    const body = JSON.parse(getRes.body);
    expect(body.error).toBe('NOT_FOUND');
  });

  it('24. delete non-existent entry → 404 NOT_FOUND', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries/${NONEXISTENT_UUID}`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('NOT_FOUND');
  });

  it('25. cross-tenant isolation: delete VLRE entry using DozalDevs tenant → 404 NOT_FOUND', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries`,
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_TEST_KEY },
      payload: {
        entity_type: 'property',
        entity_id: 'cross-tenant-delete-test',
        content: 'Entry created for cross-tenant DELETE test.',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${DOZALDEVS_TENANT}/kb/entries/${created.id}`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(deleteRes.statusCode).toBe(404);
    const body = JSON.parse(deleteRes.body);
    expect(body.error).toBe('NOT_FOUND');

    // Verify entry still exists for the correct tenant
    const getRes = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries/${created.id}`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(getRes.statusCode).toBe(200);
  });
});

// ─── Integration ─────────────────────────────────────────────────────────────

describe('Integration', () => {
  it('26. full CRUD cycle: POST → GET → PATCH → GET (verify) → DELETE → GET (verify gone)', async () => {
    // POST
    const createRes = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries`,
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_TEST_KEY },
      payload: {
        entity_type: 'property',
        entity_id: 'full-crud-cycle-property',
        content: 'Initial content for full CRUD test.',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);
    expect(created.id).toBeTruthy();

    // GET (verify created)
    const getRes1 = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries/${created.id}`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(getRes1.statusCode).toBe(200);
    expect(JSON.parse(getRes1.body).content).toBe('Initial content for full CRUD test.');

    // PATCH
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries/${created.id}`,
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_TEST_KEY },
      payload: { content: 'Updated content after PATCH in full CRUD cycle.' },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(JSON.parse(patchRes.body).content).toBe(
      'Updated content after PATCH in full CRUD cycle.',
    );

    // GET (verify update)
    const getRes2 = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries/${created.id}`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(getRes2.statusCode).toBe(200);
    expect(JSON.parse(getRes2.body).content).toBe(
      'Updated content after PATCH in full CRUD cycle.',
    );

    // DELETE
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries/${created.id}`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(deleteRes.statusCode).toBe(204);

    // GET (verify gone)
    const getRes3 = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries/${created.id}`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(getRes3.statusCode).toBe(404);
  });

  it('27. multi-property: create 3 entries for different properties, list with filter, verify correct counts', async () => {
    const properties = ['multi-prop-test-a', 'multi-prop-test-b', 'multi-prop-test-c'];

    // Create 3 entity entries for different property IDs
    for (const propId of properties) {
      const res = await app.inject({
        method: 'POST',
        url: `/admin/tenants/${VLRE_TENANT}/kb/entries`,
        headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_TEST_KEY },
        payload: {
          entity_type: 'property',
          entity_id: propId,
          content: `KB content for ${propId}.`,
        },
      });
      expect(res.statusCode).toBe(201);
    }

    // List with ?entity_type=property — should include seeded (3) + new (3) = at least 6
    const listRes = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries?entity_type=property`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(listRes.statusCode).toBe(200);
    const allProps = JSON.parse(listRes.body);
    expect(allProps.entries.length).toBeGreaterThanOrEqual(6);

    // Filter by specific new entity_id — should return exactly 1
    const filteredRes = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${VLRE_TENANT}/kb/entries?entity_type=property&entity_id=multi-prop-test-b`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(filteredRes.statusCode).toBe(200);
    const filtered = JSON.parse(filteredRes.body);
    expect(filtered.entries).toHaveLength(1);
    expect(filtered.entries[0].entity_id).toBe('multi-prop-test-b');
    expect(filtered.entries[0].entity_type).toBe('property');
  });
});
