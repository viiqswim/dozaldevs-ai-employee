import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient, TenantRole } from '@prisma/client';
import { createLogger } from '../../lib/logger.js';
import type { callLLM } from '../../lib/call-llm.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAuth, requireTenantRole } from '../middleware/authz.js';
import { uuidField } from '../validation/schemas.js';
import { sendError, sendSuccess } from '../lib/http-response.js';
import { ERROR_CODES } from '../lib/prisma-helpers.js';
import {
  ArchetypeGenerator,
  type GenerateArchetypeResponse,
} from '../services/archetype-generator.js';
import { ComposioConnectionRepository } from '../../repositories/composio-connection-repository.js';
import { ArchetypeGenerationCallRepository } from '../../repositories/ArchetypeGenerationCallRepository.js';
import { getConnectableToolkits } from '../../lib/composio/connectable-apps.js';
import type { InputSchemaItem } from '../validation/schemas.js';
import {
  mapArchetypeRowToConfig,
  validateProposalFields,
  type StrippedProposal,
} from '../lib/archetype-edit-helpers.js';

const logger = createLogger('admin-archetype-propose-edit');

export interface AdminArchetypeProposeEditRouteOptions {
  callLLM: typeof callLLM;
  prisma?: PrismaClient;
}

const ProposeEditParamsSchema = z.object({
  tenantId: uuidField(),
  archetypeId: uuidField(),
});

const ProposeEditBodySchema = z.object({
  transcript: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      }),
    )
    .min(1)
    .max(50),
});

function applyAllowlist(raw: GenerateArchetypeResponse): StrippedProposal {
  return {
    identity: raw.identity,
    execution_steps: raw.execution_steps,
    delivery_steps: raw.delivery_steps,
    overview: raw.overview,
    risk_model: raw.risk_model
      ? { approval_required: raw.risk_model.approval_required }
      : undefined,
    tool_registry: raw.tool_registry ? { tools: raw.tool_registry.tools } : undefined,
    trigger_sources: raw.trigger_sources,
    input_schema: raw.input_schema,
  };
}

function triggerSummary(
  src: GenerateArchetypeResponse['trigger_sources'] | null | undefined,
): string {
  if (!src) return 'Manual trigger';
  if (src.type === 'manual') return 'Manual trigger';
  if (src.type === 'scheduled') {
    const tz = 'timezone' in src && src.timezone ? ` (${src.timezone})` : '';
    return `Scheduled: ${'cron' in src ? src.cron : ''}${tz}`;
  }
  if (src.type === 'webhook') {
    const evtType = 'event_type' in src && src.event_type ? ` (${src.event_type})` : '';
    return `Webhook${evtType}`;
  }
  return 'Unknown trigger';
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function adminArchetypeProposeEditRoutes(
  opts: AdminArchetypeProposeEditRouteOptions,
): Router {
  const router = Router();
  const prisma = opts.prisma ?? new PrismaClient();
  const generator = new ArchetypeGenerator(opts.callLLM);
  const composioRepo = new ComposioConnectionRepository(prisma);
  const generationCallRepo = new ArchetypeGenerationCallRepository(prisma);

  router.post(
    '/admin/tenants/:tenantId/archetypes/:archetypeId/propose-edit',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.ADMIN),
    async (req, res) => {
      const paramResult = ProposeEditParamsSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, ERROR_CODES.INVALID_ID, undefined, {
          issues: paramResult.error.issues,
        });
        return;
      }

      const bodyResult = ProposeEditBodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        sendError(res, 400, ERROR_CODES.INVALID_REQUEST, undefined, {
          issues: bodyResult.error.issues,
        });
        return;
      }

      const { tenantId, archetypeId } = paramResult.data;
      const { transcript } = bodyResult.data;

      try {
        const archetype = await prisma.archetype.findFirst({
          where: { id: archetypeId, tenant_id: tenantId, deleted_at: null },
        });
        if (!archetype) {
          sendError(res, 404, ERROR_CODES.NOT_FOUND, 'Archetype not found');
          return;
        }

        const catalog = await prisma.modelCatalog.findMany({
          where: { deleted_at: null, is_active: true },
        });

        const activeConnections = await composioRepo.getActiveConnections(tenantId);
        const connectedToolkits = activeConnections.map((c) => c.toolkit);

        let connectableToolkits: string[] = [];
        try {
          const connectable = await getConnectableToolkits();
          connectableToolkits = Array.from(connectable);
        } catch (composioErr) {
          logger.warn(
            { err: composioErr },
            'getConnectableToolkits failed — proceeding with empty connectable set',
          );
        }

        const baseline = mapArchetypeRowToConfig(archetype as Record<string, unknown>);
        const result = await generator.converse(transcript, baseline, catalog, {
          connectedToolkits,
          connectableToolkits,
        });

        if (result.kind === 'question') {
          sendSuccess(res, 200, { kind: 'question', question: result.question });
          return;
        }

        if (result.kind === 'too_long') {
          sendSuccess(res, 200, { kind: 'too_long' });
          return;
        }

        if (result.kind === 'no_change') {
          sendSuccess(res, 200, { kind: 'no_change' });
          return;
        }

        try {
          await generationCallRepo.record({
            tenant_id: tenantId,
            archetype_id: archetypeId,
            call_type: 'propose_edit',
            model_actual: result.proposal.model ?? null,
            status: 'success',
            created_by: req.auth?.id ?? null,
          });
        } catch (persistErr) {
          logger.warn({ err: persistErr }, 'Failed to persist propose-edit call');
        }

        const stripped = applyAllowlist(result.proposal);
        const currentTools = baseline.tool_registry?.tools ?? [];

        const validation = validateProposalFields(
          stripped,
          baseline,
          connectedToolkits,
          connectableToolkits,
        );

        if (!validation.ok) {
          sendError(res, 422, 'PROPOSAL_INVALID', 'Some proposed changes could not be applied', {
            errors: validation.errors,
          });
          return;
        }

        if (stripped.tool_registry) {
          stripped.tool_registry = { tools: validation.validTools };
        }

        let triggerChange: { before: string; after: string } | undefined = undefined;
        if (!deepEqual(baseline.trigger_sources, stripped.trigger_sources)) {
          triggerChange = {
            before: triggerSummary(baseline.trigger_sources),
            after: triggerSummary(stripped.trigger_sources),
          };
        }

        let inputChange: { added: string[]; removed: string[] } | undefined = undefined;
        if (!deepEqual(baseline.input_schema, stripped.input_schema)) {
          const currentKeys = (baseline.input_schema ?? []).map((i) => i.key);
          const proposedKeys = (stripped.input_schema ?? []).map((i: InputSchemaItem) => i.key);
          inputChange = {
            added: proposedKeys.filter((k: string) => !currentKeys.includes(k)),
            removed: currentKeys.filter((k) => !proposedKeys.includes(k)),
          };
        }

        const currentApprovalRequired = baseline.risk_model.approval_required;
        const proposedApprovalRequired =
          stripped.risk_model?.approval_required ?? currentApprovalRequired;
        const approvalWarning = currentApprovalRequired && !proposedApprovalRequired;
        const changedFields: Record<string, unknown> = {};

        for (const field of [
          'identity',
          'execution_steps',
          'delivery_steps',
          'overview',
        ] as const) {
          if (!deepEqual(baseline[field], stripped[field])) {
            changedFields[field] = { before: baseline[field], after: stripped[field] };
          }
        }

        if (currentApprovalRequired !== proposedApprovalRequired) {
          changedFields['approval_required'] = {
            from: currentApprovalRequired,
            to: proposedApprovalRequired,
          };
        }

        const toolDelta: { added: string[]; removed: string[] } = {
          added: validation.validTools.filter((t) => !currentTools.includes(t)),
          removed: currentTools.filter((t) => !validation.validTools.includes(t)),
        };

        if (toolDelta.added.length > 0 || toolDelta.removed.length > 0) {
          changedFields['tool_registry'] = toolDelta;
        }

        if (triggerChange) {
          changedFields['trigger_sources'] = triggerChange;
        }

        if (inputChange) {
          changedFields['input_schema'] = inputChange;
        }

        const noChange = Object.keys(changedFields).length === 0;

        if (noChange) {
          sendSuccess(res, 200, { kind: 'no_change' });
          return;
        }

        const response: Record<string, unknown> = {
          kind: 'proposal',
          baseline: applyAllowlist(baseline),
          proposal: stripped,
          changed_fields: changedFields,
        };

        if (toolDelta.added.length > 0 || toolDelta.removed.length > 0) {
          response['tool_delta'] = toolDelta;
        }

        if (triggerChange) {
          response['trigger_change'] = triggerChange;
        }

        if (inputChange) {
          response['input_change'] = inputChange;
        }

        if (approvalWarning) {
          response['approval_warning'] = true;
        }

        sendSuccess(res, 200, response);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        try {
          await generationCallRepo.record({
            tenant_id: tenantId,
            archetype_id: archetypeId,
            call_type: 'propose_edit',
            status: 'failed',
            error_message: message,
            created_by: req.auth?.id ?? null,
          });
        } catch (persistErr) {
          logger.warn({ err: persistErr }, 'Failed to persist propose-edit failure');
        }

        if (message.includes('GENERATION_FAILED')) {
          sendError(res, 422, 'GENERATION_FAILED', undefined, { details: message });
          return;
        }

        logger.error({ err }, 'Archetype propose-edit failed');
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
      }
    },
  );

  return router;
}
