import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { getPrisma, disconnectPrisma } from '../../setup.js';
import { TenantRepository } from '../../../src/gateway/services/tenant-repository.js';

const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000001';

let repo: TenantRepository;

beforeEach(() => {
  repo = new TenantRepository(getPrisma());
});

afterEach(async () => {
  const prisma = getPrisma();
  await prisma.tenantSecret.deleteMany({ where: { tenant_id: { not: SYSTEM_TENANT_ID } } });
  await prisma.tenant.deleteMany({ where: { id: { not: SYSTEM_TENANT_ID } } });
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('TenantRepository', () => {
  it('create: creates a tenant and returns it', async () => {
    const tenant = await repo.create({ name: 'Test Org', slug: 'test-org' });
    expect(tenant.name).toBe('Test Org');
    expect(tenant.slug).toBe('test-org');
    expect(tenant.deleted_at).toBeNull();
    expect(tenant.status).toBe('active');
  });

  it('findById: returns tenant by id', async () => {
    const created = await repo.create({ name: 'Find Me', slug: 'find-me' });
    const found = await repo.findById(created.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
  });

  it('findById: returns null for non-existent id', async () => {
    const found = await repo.findById('00000000-0000-0000-0000-000000000099');
    expect(found).toBeNull();
  });

  it('findById: excludes soft-deleted tenants', async () => {
    const created = await repo.create({ name: 'Deleted', slug: 'deleted-tenant' });
    await repo.softDelete(created.id);
    const found = await repo.findById(created.id);
    expect(found).toBeNull();
  });

  it('findBySlug: returns tenant by slug', async () => {
    await repo.create({ name: 'Slug Test', slug: 'slug-test' });
    const found = await repo.findBySlug('slug-test');
    expect(found).not.toBeNull();
    expect(found!.slug).toBe('slug-test');
  });

  it('update: updates allowed fields', async () => {
    const created = await repo.create({ name: 'Old Name', slug: 'update-test' });
    const updated = await repo.update(created.id, { name: 'New Name', status: 'suspended' });
    expect(updated.name).toBe('New Name');
    expect(updated.status).toBe('suspended');
  });

  it('softDelete: sets deleted_at', async () => {
    const created = await repo.create({ name: 'To Delete', slug: 'to-delete' });
    const deleted = await repo.softDelete(created.id);
    expect(deleted.deleted_at).not.toBeNull();
  });

  it('softDelete: is idempotent (re-deleting returns existing row)', async () => {
    const created = await repo.create({ name: 'Idempotent', slug: 'idempotent-del' });
    const first = await repo.softDelete(created.id);
    const second = await repo.softDelete(created.id);
    expect(second.deleted_at).toEqual(first.deleted_at);
  });

  it('restore: clears deleted_at', async () => {
    const created = await repo.create({ name: 'Restore Me', slug: 'restore-me' });
    await repo.softDelete(created.id);
    const restored = await repo.restore(created.id);
    expect(restored.deleted_at).toBeNull();
  });

  it('restore: throws on slug collision with active tenant', async () => {
    const original = await repo.create({ name: 'Original', slug: 'collision-slug' });
    await repo.softDelete(original.id);
    await repo.create({ name: 'Collision', slug: 'collision-slug' });
    await expect(repo.restore(original.id)).rejects.toThrow(/slug.*collision-slug/i);
  });

  it('list: excludes soft-deleted by default', async () => {
    const active = await repo.create({ name: 'Active', slug: 'list-active' });
    const deleted = await repo.create({ name: 'Deleted', slug: 'list-deleted' });
    await repo.softDelete(deleted.id);
    const results = await repo.list();
    const ids = results.map((t) => t.id);
    expect(ids).toContain(active.id);
    expect(ids).not.toContain(deleted.id);
  });

  it('list: includes soft-deleted when includeDeleted=true', async () => {
    const active = await repo.create({ name: 'Active2', slug: 'list-active2' });
    const deleted = await repo.create({ name: 'Deleted2', slug: 'list-deleted2' });
    await repo.softDelete(deleted.id);
    const results = await repo.list({ includeDeleted: true });
    const ids = results.map((t) => t.id);
    expect(ids).toContain(active.id);
    expect(ids).toContain(deleted.id);
  });

  it('no hardDelete method exists', () => {
    expect((repo as unknown as Record<string, unknown>).hardDelete).toBeUndefined();
  });
});
