import crypto from 'crypto';
import type { PrismaClient, KnowledgeBaseEntry } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library.js';

export class KbEntryConflictError extends Error {
  constructor(message = 'A knowledge base entry with this scope already exists for this entity') {
    super(message);
    this.name = 'KbEntryConflictError';
  }
}

export type CreateKbEntryParams = {
  tenantId: string;
  entityType?: string;
  entityId?: string;
  content: string;
  prisma: PrismaClient;
};

export type ListKbEntriesParams = {
  tenantId: string;
  entityType?: string;
  entityId?: string;
  prisma: PrismaClient;
};

export type GetKbEntryParams = {
  tenantId: string;
  entryId: string;
  prisma: PrismaClient;
};

export type UpdateKbEntryParams = {
  tenantId: string;
  entryId: string;
  content: string;
  prisma: PrismaClient;
};

export type DeleteKbEntryParams = {
  tenantId: string;
  entryId: string;
  prisma: PrismaClient;
};

export async function createKbEntry(params: CreateKbEntryParams): Promise<KnowledgeBaseEntry> {
  const { tenantId, entityType, entityId, content, prisma } = params;

  const scope: 'entity' | 'common' = entityId ? 'entity' : 'common';

  // Null uniqueness guard for common-scope entries:
  // PostgreSQL unique constraints treat NULL != NULL, so (tenant_id, NULL, NULL, 'common')
  // would not be caught by the DB constraint — we must check at the application level.
  if (scope === 'common') {
    const existing = await prisma.knowledgeBaseEntry.findFirst({
      where: {
        tenant_id: tenantId,
        entity_type: entityType ?? null,
        entity_id: null,
        scope: 'common',
      },
    });
    if (existing) {
      throw new KbEntryConflictError(
        'A common knowledge base entry already exists for this tenant and entity type. Use PATCH to update it.',
      );
    }
  }

  try {
    return await prisma.knowledgeBaseEntry.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        entity_type: entityType ?? null,
        entity_id: entityId ?? null,
        scope,
        content,
      },
    });
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new KbEntryConflictError();
    }
    throw error;
  }
}

export async function listKbEntries(params: ListKbEntriesParams): Promise<KnowledgeBaseEntry[]> {
  const { tenantId, entityType, entityId, prisma } = params;

  return prisma.knowledgeBaseEntry.findMany({
    where: {
      tenant_id: tenantId,
      ...(entityType !== undefined && { entity_type: entityType }),
      ...(entityId !== undefined && { entity_id: entityId }),
    },
    orderBy: { created_at: 'desc' },
  });
}

export async function getKbEntry(params: GetKbEntryParams): Promise<KnowledgeBaseEntry | null> {
  const { tenantId, entryId, prisma } = params;

  return prisma.knowledgeBaseEntry.findFirst({
    where: {
      id: entryId,
      tenant_id: tenantId,
    },
  });
}

export async function updateKbEntry(
  params: UpdateKbEntryParams,
): Promise<{ count: number; entry: KnowledgeBaseEntry | null }> {
  const { tenantId, entryId, content, prisma } = params;

  const result = await prisma.knowledgeBaseEntry.updateMany({
    where: {
      id: entryId,
      tenant_id: tenantId,
    },
    data: { content },
  });

  if (result.count === 0) {
    return { count: 0, entry: null };
  }

  const entry = await prisma.knowledgeBaseEntry.findFirst({
    where: { id: entryId, tenant_id: tenantId },
  });

  return { count: result.count, entry };
}

export async function deleteKbEntry(params: DeleteKbEntryParams): Promise<{ count: number }> {
  const { tenantId, entryId, prisma } = params;

  const result = await prisma.knowledgeBaseEntry.deleteMany({
    where: {
      id: entryId,
      tenant_id: tenantId,
    },
  });

  return { count: result.count };
}
