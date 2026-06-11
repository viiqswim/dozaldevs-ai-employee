import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComposioConnectionRepository } from '../../../src/repositories/composio-connection-repository.js';

function makePrisma() {
  return {
    composioConnection: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    taskComposioCall: {
      create: vi.fn(),
    },
  };
}

const activeConnection = {
  id: 'conn-1',
  tenant_id: 'tenant-1',
  toolkit: 'notion',
  status: 'active',
  connected_at: new Date('2026-06-11T00:00:00Z'),
  disconnected_at: null,
  deleted_at: null,
  created_at: new Date('2026-06-11T00:00:00Z'),
  updated_at: new Date('2026-06-11T00:00:00Z'),
};

describe('ComposioConnectionRepository', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repo: ComposioConnectionRepository;

  beforeEach(() => {
    prisma = makePrisma();
    repo = new ComposioConnectionRepository(prisma as never);
  });

  describe('getActiveConnections', () => {
    it('queries only active, non-deleted rows ordered by connected_at desc', async () => {
      prisma.composioConnection.findMany.mockResolvedValue([activeConnection]);

      const result = await repo.getActiveConnections('tenant-1');

      expect(prisma.composioConnection.findMany).toHaveBeenCalledWith({
        where: { tenant_id: 'tenant-1', status: 'active', deleted_at: null },
        orderBy: { connected_at: 'desc' },
      });
      expect(result).toEqual([activeConnection]);
    });

    it('returns empty array when no active connections exist', async () => {
      prisma.composioConnection.findMany.mockResolvedValue([]);
      expect(await repo.getActiveConnections('tenant-1')).toEqual([]);
    });
  });

  describe('upsertConnection', () => {
    it('creates a new active connection when none exists', async () => {
      prisma.composioConnection.upsert.mockResolvedValue(activeConnection);

      const result = await repo.upsertConnection('tenant-1', 'notion');

      expect(prisma.composioConnection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id_toolkit: { tenant_id: 'tenant-1', toolkit: 'notion' } },
          create: { tenant_id: 'tenant-1', toolkit: 'notion', status: 'active' },
        }),
      );
      expect(result).toBe(activeConnection);
    });

    it('reactivates a previously-deleted row (clears deleted_at and disconnected_at)', async () => {
      prisma.composioConnection.upsert.mockResolvedValue(activeConnection);

      await repo.upsertConnection('tenant-1', 'notion');

      const callArgs = prisma.composioConnection.upsert.mock.calls[0][0];
      expect(callArgs.update).toMatchObject({
        status: 'active',
        disconnected_at: null,
        deleted_at: null,
      });
      expect(callArgs.update.connected_at).toBeInstanceOf(Date);
    });
  });

  describe('disconnectConnection', () => {
    it('sets status=disconnected and disconnected_at on the live row', async () => {
      prisma.composioConnection.updateMany.mockResolvedValue({ count: 1 });

      await repo.disconnectConnection('tenant-1', 'notion');

      expect(prisma.composioConnection.updateMany).toHaveBeenCalledTimes(1);
      const callArgs = prisma.composioConnection.updateMany.mock.calls[0][0];
      expect(callArgs.where).toEqual({
        tenant_id: 'tenant-1',
        toolkit: 'notion',
        deleted_at: null,
      });
      expect(callArgs.data.status).toBe('disconnected');
      expect(callArgs.data.disconnected_at).toBeInstanceOf(Date);
    });
  });
});
