import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library.js';
import type { InngestLike } from '../types.js';

export interface DispatchEmployeeParams {
  tenantId: string;
  slug: string;
  dryRun: boolean;
  prisma: PrismaClient;
  inngest: InngestLike;
  inputs?: Record<string, string>;
}

export type DispatchEmployeeResult =
  | { kind: 'dispatched'; taskId: string; archetypeId: string }
  | {
      kind: 'dry_run';
      archetypeId: string;
      wouldFire: { eventName: string; data: Record<string, unknown>; externalId: string };
    }
  | {
      kind: 'error';
      code:
        | 'ARCHETYPE_NOT_FOUND'
        | 'UNSUPPORTED_RUNTIME'
        | 'INVALID_ARCHETYPE_CONFIG'
        | 'MODEL_NOT_CONFIGURED';
      message: string;
    };

export async function dispatchEmployee(
  params: DispatchEmployeeParams,
): Promise<DispatchEmployeeResult> {
  const { tenantId, slug, dryRun, prisma, inngest, inputs } = params;

  const archetype = await prisma.archetype.findFirst({
    where: { tenant_id: tenantId, role_name: slug, status: 'active', deleted_at: null },
  });

  if (!archetype) {
    return {
      kind: 'error',
      code: 'ARCHETYPE_NOT_FOUND',
      message: `No archetype found for tenant ${tenantId} with role_name ${slug}`,
    };
  }

  const supportedRuntimes = ['generic-harness', 'opencode'];
  if (!supportedRuntimes.includes(archetype.runtime ?? '')) {
    return {
      kind: 'error',
      code: 'UNSUPPORTED_RUNTIME',
      message: `Manual trigger for runtime ${archetype.runtime} is not yet supported`,
    };
  }

  if (!archetype.model) {
    return {
      kind: 'error',
      code: 'MODEL_NOT_CONFIGURED',
      message: `Archetype "${slug}" has no model configured. Set a model via the admin API before triggering.`,
    };
  }

  const externalId = `manual-${crypto.randomUUID()}`;

  const wouldFire = {
    eventName: 'employee/task.dispatched',
    data: { taskId: '<pending>', archetypeId: archetype.id },
    externalId,
  };

  if (dryRun) {
    return { kind: 'dry_run', archetypeId: archetype.id, wouldFire };
  }

  const task = await prisma.task.create({
    data: {
      archetype_id: archetype.id,
      external_id: externalId,
      source_system: 'manual',
      status: 'Ready',
      tenant_id: tenantId,
      ...(inputs ? { raw_event: { inputs } } : {}),
    },
  });

  await inngest.send({
    name: 'employee/task.dispatched',
    data: { taskId: task.id, archetypeId: archetype.id },
    id: `manual-dispatch-${externalId}`,
  });

  return { kind: 'dispatched', taskId: task.id, archetypeId: archetype.id };
}

export interface DispatchEmployeeByIdParams {
  archetypeId: string;
  tenantId: string;
  externalId: string;
  sourceSystem: string;
  prisma: PrismaClient;
  inngest: InngestLike;
  inputs?: Record<string, string>;
}

export type DispatchEmployeeByIdResult =
  | { kind: 'dispatched'; taskId: string }
  | { kind: 'idempotent'; taskId: string }
  | { kind: 'error'; code: 'ARCHETYPE_NOT_FOUND'; message: string };

/**
 * Dispatch an employee task by archetype ID (rather than slug).
 * Handles idempotent re-dispatch: if a task with the same external_id already
 * exists (P2002), reuses it and re-sends the Inngest event (Inngest deduplicates
 * by the event `id` field).
 */
export async function dispatchEmployeeById(
  params: DispatchEmployeeByIdParams,
): Promise<DispatchEmployeeByIdResult> {
  const { archetypeId, tenantId, externalId, sourceSystem, prisma, inngest, inputs } = params;

  const archetype = await prisma.archetype.findFirst({
    where: { id: archetypeId, tenant_id: tenantId, status: 'active', deleted_at: null },
    select: { id: true },
  });

  if (!archetype) {
    return {
      kind: 'error',
      code: 'ARCHETYPE_NOT_FOUND',
      message: `Archetype ${archetypeId} not found or inactive for tenant ${tenantId}`,
    };
  }

  let taskId: string;
  let kind: 'dispatched' | 'idempotent';

  try {
    const task = await prisma.task.create({
      data: {
        archetype_id: archetypeId,
        external_id: externalId,
        source_system: sourceSystem,
        status: 'Ready',
        tenant_id: tenantId,
        ...(inputs ? { raw_event: { inputs } } : {}),
      },
    });
    taskId = task.id;
    kind = 'dispatched';
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
      // Duplicate external_id — reuse existing task (idempotent re-trigger)
      const existing = await prisma.task.findFirst({
        where: { external_id: externalId, source_system: sourceSystem, tenant_id: tenantId },
        select: { id: true },
      });
      if (!existing) throw error;
      taskId = existing.id;
      kind = 'idempotent';
    } else {
      throw error;
    }
  }

  await inngest.send({
    name: 'employee/task.dispatched',
    data: { taskId, archetypeId },
    id: `employee-dispatch-${externalId}`,
  });

  return { kind, taskId };
}
