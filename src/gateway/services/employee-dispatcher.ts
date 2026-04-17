import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { InngestLike } from '../types.js';

export interface DispatchEmployeeParams {
  tenantId: string;
  slug: string;
  dryRun: boolean;
  prisma: PrismaClient;
  inngest: InngestLike;
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
      code: 'ARCHETYPE_NOT_FOUND' | 'UNSUPPORTED_RUNTIME' | 'INVALID_ARCHETYPE_CONFIG';
      message: string;
    };

export async function dispatchEmployee(
  params: DispatchEmployeeParams,
): Promise<DispatchEmployeeResult> {
  const { tenantId, slug, dryRun, prisma, inngest } = params;

  const archetype = await prisma.archetype.findUnique({
    where: { tenant_id_role_name: { tenant_id: tenantId, role_name: slug } },
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
    },
  });

  await inngest.send({
    name: 'employee/task.dispatched',
    data: { taskId: task.id, archetypeId: archetype.id },
    id: `manual-dispatch-${externalId}`,
  });

  return { kind: 'dispatched', taskId: task.id, archetypeId: archetype.id };
}
