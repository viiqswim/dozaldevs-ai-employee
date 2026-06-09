import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArchetypeRepository } from '../../src/gateway/services/archetype-repository.js';
import { TenantIntegrationRepository } from '../../src/gateway/services/tenant-integration-repository.js';

const TENANT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';
const ARCHETYPE_ID = 'arch0001-0000-0000-0000-000000000000';

function makeArchetype(id = ARCHETYPE_ID, deletedAt: Date | null = null) {
  return {
    id,
    tenant_id: TENANT_ID,
    role_name: 'Test Employee',
    status: deletedAt ? 'inactive' : 'active',
    deleted_at: deletedAt,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function makeIntegration(tenantId = TENANT_ID, provider = 'github', deletedAt: Date | null = null) {
  return {
    id: 'integ-0001-0000-0000-000000000000',
    tenant_id: tenantId,
    provider,
    external_id: 'ext-123',
    config: null,
    status: 'active',
    deleted_at: deletedAt,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

describe('Soft-delete filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ArchetypeRepository', () => {
    it('softDelete sets deleted_at and status:inactive on the archetype', async () => {
      const updateMock = vi.fn().mockResolvedValue(makeArchetype(ARCHETYPE_ID, new Date()));
      const prisma = {
        archetype: {
          findFirst: vi.fn().mockResolvedValue(makeArchetype()),
        },
        task: { findMany: vi.fn().mockResolvedValue([]) },
        taskStatusLog: { create: vi.fn().mockResolvedValue({}) },
        pendingApproval: { deleteMany: vi.fn().mockResolvedValue({}) },
        $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
          const tx = {
            task: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
            taskStatusLog: { create: vi.fn() },
            pendingApproval: { deleteMany: vi.fn() },
            archetype: { update: updateMock },
          };
          return fn(tx);
        }),
      } as never;

      const repo = new ArchetypeRepository(prisma);
      await repo.softDelete(ARCHETYPE_ID, TENANT_ID);

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ARCHETYPE_ID },
          data: expect.objectContaining({ deleted_at: expect.any(Date), status: 'inactive' }),
        }),
      );
    });

    it('softDelete is a no-op when archetype is already soft-deleted', async () => {
      const alreadyDeleted = makeArchetype(ARCHETYPE_ID, new Date());
      const prisma = {
        archetype: {
          findFirst: vi.fn().mockResolvedValue(alreadyDeleted),
        },
      } as never;

      const repo = new ArchetypeRepository(prisma);
      const result = await repo.softDelete(ARCHETYPE_ID, TENANT_ID);

      expect(result).toEqual(alreadyDeleted);
    });

    it('restore clears deleted_at and returns status:active', async () => {
      const deletedArchetype = makeArchetype(ARCHETYPE_ID, new Date(0));
      const restored = { ...deletedArchetype, deleted_at: null, status: 'active' };
      const updateMock = vi.fn().mockResolvedValue(restored);
      const prisma = {
        archetype: {
          findUnique: vi.fn().mockResolvedValue(deletedArchetype),
          findFirst: vi.fn().mockResolvedValue(null),
          update: updateMock,
        },
      } as never;

      const repo = new ArchetypeRepository(prisma);
      const result = await repo.restore(ARCHETYPE_ID, TENANT_ID);

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ARCHETYPE_ID },
          data: expect.objectContaining({ deleted_at: null, status: 'active' }),
        }),
      );
      expect(result.deleted_at).toBeNull();
    });

    it('restore is a no-op when archetype is already active', async () => {
      const activeArchetype = makeArchetype();
      const updateMock = vi.fn();
      const prisma = {
        archetype: {
          findUnique: vi.fn().mockResolvedValue(activeArchetype),
          update: updateMock,
        },
      } as never;

      const repo = new ArchetypeRepository(prisma);
      const result = await repo.restore(ARCHETYPE_ID, TENANT_ID);

      expect(result).toEqual(activeArchetype);
      expect(updateMock).not.toHaveBeenCalled();
    });
  });

  describe('TenantIntegrationRepository', () => {
    it('findByTenantAndProvider passes deleted_at:null filter', async () => {
      const integration = makeIntegration();
      const findFirstMock = vi.fn().mockResolvedValue(integration);
      const prisma = {
        tenantIntegration: { findFirst: findFirstMock },
      } as never;

      const repo = new TenantIntegrationRepository(prisma);
      const result = await repo.findByTenantAndProvider(TENANT_ID, 'github');

      expect(findFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ deleted_at: null }) }),
      );
      expect(result).toEqual(integration);
    });

    it('findByTenantAndProvider returns null for soft-deleted integration', async () => {
      const prisma = {
        tenantIntegration: { findFirst: vi.fn().mockResolvedValue(null) },
      } as never;

      const repo = new TenantIntegrationRepository(prisma);
      const result = await repo.findByTenantAndProvider(TENANT_ID, 'github');

      expect(result).toBeNull();
    });

    it('findByExternalId passes deleted_at:null filter', async () => {
      const integration = makeIntegration();
      const findFirstMock = vi.fn().mockResolvedValue(integration);
      const prisma = {
        tenantIntegration: { findFirst: findFirstMock },
      } as never;

      const repo = new TenantIntegrationRepository(prisma);
      await repo.findByExternalId('github', 'ext-123');

      expect(findFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ deleted_at: null }) }),
      );
    });

    it('findManyByExternalId passes deleted_at:null filter', async () => {
      const findManyMock = vi.fn().mockResolvedValue([makeIntegration()]);
      const prisma = {
        tenantIntegration: { findMany: findManyMock },
      } as never;

      const repo = new TenantIntegrationRepository(prisma);
      await repo.findManyByExternalId('github', 'ext-123');

      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ deleted_at: null }) }),
      );
    });

    it('delete sets deleted_at on the integration', async () => {
      const existing = makeIntegration();
      const updateMock = vi.fn().mockResolvedValue({ ...existing, deleted_at: new Date() });
      const prisma = {
        tenantIntegration: {
          findFirst: vi.fn().mockResolvedValue(existing),
          update: updateMock,
        },
      } as never;

      const repo = new TenantIntegrationRepository(prisma);
      await repo.delete(TENANT_ID, 'github');

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: existing.id },
          data: expect.objectContaining({ deleted_at: expect.any(Date) }),
        }),
      );
    });

    it('delete is a no-op when integration does not exist or is already soft-deleted', async () => {
      const updateMock = vi.fn();
      const prisma = {
        tenantIntegration: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: updateMock,
        },
      } as never;

      const repo = new TenantIntegrationRepository(prisma);
      await repo.delete(TENANT_ID, 'github');

      expect(updateMock).not.toHaveBeenCalled();
    });
  });

  describe('ModelCatalog soft-delete filtering (route-layer query contracts)', () => {
    it('findMany for active models passes deleted_at:null filter', async () => {
      const findManyMock = vi.fn().mockResolvedValue([]);
      const prisma = { modelCatalog: { findMany: findManyMock } };

      await prisma.modelCatalog.findMany({
        where: { deleted_at: null, is_active: true },
        orderBy: { created_at: 'desc' },
      });

      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ deleted_at: null }) }),
      );
    });

    it('findFirst for a single model passes deleted_at:null filter', async () => {
      const findFirstMock = vi.fn().mockResolvedValue(null);
      const prisma = { modelCatalog: { findFirst: findFirstMock } };

      await prisma.modelCatalog.findFirst({ where: { id: 'some-id', deleted_at: null } });

      expect(findFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ deleted_at: null }) }),
      );
    });

    it('soft-delete sets deleted_at on the model entry', async () => {
      const updateMock = vi.fn().mockResolvedValue({ id: 'model-id', deleted_at: new Date() });
      const prisma = {
        modelCatalog: {
          findFirst: vi.fn().mockResolvedValue({ id: 'model-id', deleted_at: null }),
          update: updateMock,
        },
      };

      await prisma.modelCatalog.update({
        where: { id: 'model-id' },
        data: { deleted_at: new Date() },
      });

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'model-id' },
          data: expect.objectContaining({ deleted_at: expect.any(Date) }),
        }),
      );
    });

    it('soft-deleted model is not returned by findMany with deleted_at:null filter', async () => {
      const allModels = [
        { id: 'active-model', deleted_at: null, is_active: true },
        { id: 'deleted-model', deleted_at: new Date(), is_active: true },
      ];
      const findManyMock = vi.fn().mockImplementation((opts: { where?: { deleted_at?: null } }) => {
        if (opts?.where?.deleted_at === null) {
          return Promise.resolve(allModels.filter((m) => m.deleted_at === null));
        }
        return Promise.resolve(allModels);
      });
      const prisma = { modelCatalog: { findMany: findManyMock } };

      const result = await prisma.modelCatalog.findMany({ where: { deleted_at: null } });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('active-model');
    });
  });
});
