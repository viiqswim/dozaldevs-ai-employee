import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadTenantEnv } from '../../../src/gateway/services/tenant-env-loader.js';

const TENANT_A_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';
const TENANT_B_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6';

function makeTenant(id: string, config: unknown = null) {
  return {
    id,
    name: 'Acme',
    slug: 'acme',
    slack_team_id: null,
    config,
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };
}

function makeDeps(overrides: {
  findById?: ReturnType<typeof vi.fn>;
  listKeys?: ReturnType<typeof vi.fn>;
  getMany?: ReturnType<typeof vi.fn>;
}) {
  const tenantRepo = {
    findById: overrides.findById ?? vi.fn().mockResolvedValue(null),
  } as never;
  const secretRepo = {
    listKeys: overrides.listKeys ?? vi.fn().mockResolvedValue([]),
    getMany: overrides.getMany ?? vi.fn().mockResolvedValue({}),
  } as never;
  return { tenantRepo, secretRepo };
}

describe('loadTenantEnv — Hostfully secret injection', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('maps hostfully_api_key → HOSTFULLY_API_KEY (uppercase only)', async () => {
    const deps = makeDeps({
      findById: vi.fn().mockResolvedValue(makeTenant(TENANT_A_ID)),
      listKeys: vi
        .fn()
        .mockResolvedValue([{ key: 'hostfully_api_key', is_set: true, updated_at: new Date() }]),
      getMany: vi.fn().mockResolvedValue({ hostfully_api_key: 'Y6EQ7KgSwoOGCokD' }),
    });
    const env = await loadTenantEnv(TENANT_A_ID, deps);
    expect(env['HOSTFULLY_API_KEY']).toBe('Y6EQ7KgSwoOGCokD');
    expect(env['hostfully_api_key']).toBeUndefined();
  });

  it('maps hostfully_agency_uid → HOSTFULLY_AGENCY_UID (uppercase only)', async () => {
    const deps = makeDeps({
      findById: vi.fn().mockResolvedValue(makeTenant(TENANT_A_ID)),
      listKeys: vi
        .fn()
        .mockResolvedValue([{ key: 'hostfully_agency_uid', is_set: true, updated_at: new Date() }]),
      getMany: vi.fn().mockResolvedValue({
        hostfully_agency_uid: '942d08d9-82bb-4fd3-9091-ca0c6b50b578',
      }),
    });
    const env = await loadTenantEnv(TENANT_A_ID, deps);
    expect(env['HOSTFULLY_AGENCY_UID']).toBe('942d08d9-82bb-4fd3-9091-ca0c6b50b578');
    expect(env['hostfully_agency_uid']).toBeUndefined();
  });

  it('maps both hostfully secrets when both are present', async () => {
    const deps = makeDeps({
      findById: vi.fn().mockResolvedValue(makeTenant(TENANT_A_ID)),
      listKeys: vi.fn().mockResolvedValue([
        { key: 'hostfully_api_key', is_set: true, updated_at: new Date() },
        { key: 'hostfully_agency_uid', is_set: true, updated_at: new Date() },
      ]),
      getMany: vi.fn().mockResolvedValue({
        hostfully_api_key: 'Y6EQ7KgSwoOGCokD',
        hostfully_agency_uid: '942d08d9-82bb-4fd3-9091-ca0c6b50b578',
      }),
    });
    const env = await loadTenantEnv(TENANT_A_ID, deps);
    expect(env['HOSTFULLY_API_KEY']).toBe('Y6EQ7KgSwoOGCokD');
    expect(env['HOSTFULLY_AGENCY_UID']).toBe('942d08d9-82bb-4fd3-9091-ca0c6b50b578');
  });

  it('tenant isolation — two tenants get different HOSTFULLY_API_KEY values', async () => {
    const findById = vi
      .fn()
      .mockImplementation((id: string) =>
        id === TENANT_A_ID ? makeTenant(TENANT_A_ID) : makeTenant(TENANT_B_ID),
      );
    const listKeys = vi
      .fn()
      .mockResolvedValue([{ key: 'hostfully_api_key', is_set: true, updated_at: new Date() }]);
    const getMany = vi
      .fn()
      .mockImplementation((tenantId: string) =>
        tenantId === TENANT_A_ID ? { hostfully_api_key: 'key-a' } : { hostfully_api_key: 'key-b' },
      );

    const depsA = makeDeps({ findById, listKeys, getMany });
    const depsB = makeDeps({ findById, listKeys, getMany });

    const envA = await loadTenantEnv(TENANT_A_ID, depsA);
    const envB = await loadTenantEnv(TENANT_B_ID, depsB);

    expect(envA['HOSTFULLY_API_KEY']).toBe('key-a');
    expect(envB['HOSTFULLY_API_KEY']).toBe('key-b');
    expect(envA['HOSTFULLY_API_KEY']).not.toBe(envB['HOSTFULLY_API_KEY']);
  });

  it('Hostfully secrets do NOT appear as lowercase keys in output', async () => {
    const deps = makeDeps({
      findById: vi.fn().mockResolvedValue(makeTenant(TENANT_A_ID)),
      listKeys: vi.fn().mockResolvedValue([
        { key: 'hostfully_api_key', is_set: true, updated_at: new Date() },
        { key: 'hostfully_agency_uid', is_set: true, updated_at: new Date() },
      ]),
      getMany: vi.fn().mockResolvedValue({
        hostfully_api_key: 'Y6EQ7KgSwoOGCokD',
        hostfully_agency_uid: '942d08d9-82bb-4fd3-9091-ca0c6b50b578',
      }),
    });
    const env = await loadTenantEnv(TENANT_A_ID, deps);
    expect(env['hostfully_api_key']).toBeUndefined();
    expect(env['hostfully_agency_uid']).toBeUndefined();
  });
});
