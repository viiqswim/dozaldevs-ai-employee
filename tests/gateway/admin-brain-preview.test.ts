import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import express from 'express';
import { TestApp, getPrisma, ADMIN_TEST_KEY } from '../setup.js';
import { adminBrainPreviewRoutes } from '../../src/gateway/routes/admin-brain-preview.js';

const VLRE_TENANT = '00000000-0000-0000-0000-000000000003';
const VLRE_ARCHETYPE = '00000000-0000-0000-0000-000000000015';
const NONEXISTENT_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

let app: TestApp;

beforeEach(async () => {
  process.env.ADMIN_API_KEY = ADMIN_TEST_KEY;
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use(adminBrainPreviewRoutes({ prisma: getPrisma() }));
  app = new TestApp(expressApp);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

afterAll(async () => {
  // No disconnectPrisma here since getPrisma() is shared with other tests
});

describe('GET /admin/tenants/:tenantId/archetypes/:archetypeId/brain-preview', () => {
  it('1. returns 200 with full payload for existing archetype', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${VLRE_TENANT}/archetypes/${VLRE_ARCHETYPE}/brain-preview`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // All required top-level keys present
    expect(body).toHaveProperty('execution_prompt');
    expect(body).toHaveProperty('delivery_prompt');
    expect(body).toHaveProperty('agents_md');
    expect(body).toHaveProperty('env_vars');
    expect(body).toHaveProperty('tools');
    expect(body).toHaveProperty('skills');
    expect(body).toHaveProperty('config');
    expect(body).toHaveProperty('output_contract');
    expect(body).toHaveProperty('employee_rules');
    expect(body).toHaveProperty('employee_knowledge');
  });

  it('2. execution_prompt is non-empty string', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${VLRE_TENANT}/archetypes/${VLRE_ARCHETYPE}/brain-preview`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(typeof body.execution_prompt).toBe('string');
    expect(body.execution_prompt.length).toBeGreaterThan(0);
  });

  it('3. agents_md has platform layer with content', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${VLRE_TENANT}/archetypes/${VLRE_ARCHETYPE}/brain-preview`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.agents_md).toHaveProperty('full');
    expect(body.agents_md).toHaveProperty('layers');
    expect(body.agents_md.layers).toHaveProperty('platform');
    // Platform AGENTS.md must contain the known header text
    expect(body.agents_md.layers.platform).toContain('AI Employee Worker');
    expect(body.agents_md.full).toContain('# Platform Policy');
  });

  it('4. env_vars contains expected categories and no actual values', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${VLRE_TENANT}/archetypes/${VLRE_ARCHETYPE}/brain-preview`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.env_vars)).toBe(true);
    expect(body.env_vars.length).toBeGreaterThan(5);
    // Each entry must have the right shape
    for (const v of body.env_vars as Array<{
      name: string;
      source: string;
      category: string;
      is_set: boolean;
    }>) {
      expect(typeof v.name).toBe('string');
      expect([
        'platform',
        'tenant_secret',
        'tenant_config',
        'lifecycle',
        'raw_event',
        'harness',
      ]).toContain(v.source);
      expect(['always', 'conditional']).toContain(v.category);
      expect(typeof v.is_set).toBe('boolean');
    }
    // Must have platform vars
    expect(body.env_vars.some((v: { source: string }) => v.source === 'platform')).toBe(true);
    // Must have lifecycle vars
    expect(body.env_vars.some((v: { source: string }) => v.source === 'lifecycle')).toBe(true);
  });

  it('5. returns 404 for non-existent archetype', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${VLRE_TENANT}/archetypes/${NONEXISTENT_UUID}/brain-preview`,
      headers: { 'x-admin-key': ADMIN_TEST_KEY },
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('NOT_FOUND');
  });

  it('6. returns 401 without admin key', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${VLRE_TENANT}/archetypes/${VLRE_ARCHETYPE}/brain-preview`,
      // No x-admin-key header
    });
    expect(res.statusCode).toBe(401);
  });
});
