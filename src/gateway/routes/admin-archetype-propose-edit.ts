import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient, TenantRole } from '@prisma/client';
import { createLogger } from '../../lib/logger.js';
import type { callLLM } from '../../lib/call-llm.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAuth, requireTenantRole } from '../middleware/authz.js';
import { uuidField, InputSchemaSchema } from '../validation/schemas.js';
import { sendError, sendSuccess } from '../lib/http-response.js';
import { ERROR_CODES } from '../lib/prisma-helpers.js';
import {
  ArchetypeGenerator,
  type GenerateArchetypeResponse,
} from '../services/archetype-generator.js';
import { ComposioConnectionRepository } from '../../repositories/composio-connection-repository.js';
import { getConnectableToolkits } from '../../lib/composio/connectable-apps.js';
import { ALL_TOOL_DESCRIPTORS, toolInvocationPath } from '../../lib/tool-registry.js';
import type { InputSchemaItem } from '../validation/schemas.js';

const logger = createLogger('admin-archetype-propose-edit');

export interface AdminArchetypeProposeEditRouteOptions {
  callLLM: typeof callLLM;
  prisma?: PrismaClient;
}

const TriggerSourceSchema = z.union([
  z.object({ type: z.literal('manual') }),
  z.object({
    type: z.literal('scheduled'),
    cron: z.string(),
    timezone: z.string().optional(),
  }),
  z.object({
    type: z.literal('webhook'),
    event_type: z.string().optional(),
  }),
]);

const ProposeEditParamsSchema = z.object({
  tenantId: uuidField(),
  archetypeId: uuidField(),
});

const ProposeEditBodySchema = z.object({
  request_text: z.string().min(1).max(500),
});

interface StrippedProposal {
  identity?: string;
  execution_steps?: string;
  delivery_steps?: string | null;
  overview?: GenerateArchetypeResponse['overview'];
  risk_model?: { approval_required: boolean };
  tool_registry?: { tools: string[] };
  trigger_sources?: GenerateArchetypeResponse['trigger_sources'];
  input_schema?: InputSchemaItem[];
}

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

interface ToolValidationResult {
  validTools: string[];
  rejectedTools: Array<{ tool: string; reason: string }>;
}

function validateTools(proposedTools: string[], connectedToolkits: string[]): ToolValidationResult {
  // Archetypes store bare container paths (e.g. /tools/slack/post-message.ts).
  // toolInvocationPath() returns "tsx /tools/..." — strip the "tsx " prefix so
  // the Set matches the format both the DB and the LLM generator produce.
  const shellToolPaths = new Set(
    ALL_TOOL_DESCRIPTORS.map((d) => toolInvocationPath(d).replace(/^tsx /, '')),
  );
  const composioSet = new Set(connectedToolkits);

  const validTools: string[] = [];
  const rejectedTools: Array<{ tool: string; reason: string }> = [];

  for (const tool of proposedTools) {
    if (shellToolPaths.has(tool)) {
      validTools.push(tool);
    } else if (composioSet.has(tool)) {
      validTools.push(tool);
    } else {
      const composioToolPattern = /^\/tools\/composio\//;
      if (composioToolPattern.test(tool)) {
        if (connectedToolkits.length === 0) {
          rejectedTools.push({
            tool,
            reason: `Composio tool "${tool}" requires a connected Composio app, but none are connected for this employee.`,
          });
        } else {
          if (shellToolPaths.has(tool)) {
            validTools.push(tool);
          } else {
            rejectedTools.push({
              tool,
              reason: `Tool "${tool}" is not a recognised shell tool or connected Composio toolkit.`,
            });
          }
        }
      } else {
        rejectedTools.push({
          tool,
          reason: `Tool "${tool}" is not available. It is not in the platform's tool library and does not match any connected app.`,
        });
      }
    }
  }

  return { validTools, rejectedTools };
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

function mapArchetypeRowToConfig(row: Record<string, unknown>): GenerateArchetypeResponse {
  const riskModel = (row.risk_model ?? {}) as Record<string, unknown>;
  return {
    role_name: String(row.role_name ?? ''),
    model: String(row.model ?? 'deepseek/deepseek-v4-flash'),
    runtime: 'opencode',
    identity: String(row.identity ?? ''),
    execution_steps: String(row.execution_steps ?? ''),
    delivery_steps: typeof row.delivery_steps === 'string' ? row.delivery_steps : null,
    delivery_instructions:
      typeof row.delivery_instructions === 'string' ? row.delivery_instructions : null,
    instructions: String(row.execution_instructions ?? ''),
    deliverable_type: typeof row.deliverable_type === 'string' ? row.deliverable_type : null,
    input_schema: Array.isArray(row.input_schema)
      ? (row.input_schema as InputSchemaItem[])
      : undefined,
    risk_model: {
      approval_required: Boolean(riskModel.approval_required),
      timeout_hours: typeof riskModel.timeout_hours === 'number' ? riskModel.timeout_hours : 24,
    },
    trigger_sources: (row.trigger_sources ?? {
      type: 'manual',
    }) as GenerateArchetypeResponse['trigger_sources'],
    tool_registry: {
      tools: Array.isArray((row.tool_registry as Record<string, unknown>)?.tools)
        ? ((row.tool_registry as Record<string, unknown>).tools as string[])
        : [],
    },
    concurrency_limit: typeof row.concurrency_limit === 'number' ? row.concurrency_limit : 1,
    vm_size: typeof row.vm_size === 'string' ? row.vm_size : null,
    worker_env:
      row.worker_env && typeof row.worker_env === 'object'
        ? (row.worker_env as Record<string, string>)
        : null,
    platform_rules_override:
      typeof row.platform_rules_override === 'string' ? row.platform_rules_override : null,
    estimated_manual_minutes:
      typeof row.estimated_manual_minutes === 'number' ? row.estimated_manual_minutes : null,
    overview: (row.overview ?? {
      role: '',
      trigger: '',
      workflow: [],
      tools_used: '',
      output: '',
      approval: '',
    }) as GenerateArchetypeResponse['overview'],
  };
}

export function adminArchetypeProposeEditRoutes(
  opts: AdminArchetypeProposeEditRouteOptions,
): Router {
  const router = Router();
  const prisma = opts.prisma ?? new PrismaClient();
  const generator = new ArchetypeGenerator(opts.callLLM);
  const composioRepo = new ComposioConnectionRepository(prisma);

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
      const { request_text } = bodyResult.data;

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
        const rawProposal = await generator.refine(baseline, request_text, catalog, {
          connectedToolkits,
          connectableToolkits,
        });

        const stripped = applyAllowlist(rawProposal);
        const errors: Array<{ field: string; reason: string }> = [];

        const proseFields = ['identity', 'execution_steps', 'delivery_steps'] as const;
        for (const field of proseFields) {
          const baselineValue = baseline[field];
          const proposedValue = stripped[field];
          const baselineNonEmpty =
            typeof baselineValue === 'string' && baselineValue.trim().length > 0;
          const proposedEmpty =
            proposedValue === undefined ||
            proposedValue === null ||
            (typeof proposedValue === 'string' && proposedValue.trim().length === 0);
          if (baselineNonEmpty && proposedEmpty) {
            errors.push({
              field,
              reason: `The "${field}" field was non-empty but the proposal would make it blank. This is not allowed — please refine your request.`,
            });
          }
        }

        const currentTools = baseline.tool_registry?.tools ?? [];
        const proposedTools = stripped.tool_registry?.tools ?? [];
        const { validTools, rejectedTools } = validateTools(proposedTools, connectedToolkits);

        if (rejectedTools.length > 0) {
          for (const { tool, reason } of rejectedTools) {
            errors.push({ field: `tool_registry.tools[${tool}]`, reason });
          }
        }

        let triggerChange: { before: string; after: string } | undefined = undefined;

        if (!deepEqual(baseline.trigger_sources, stripped.trigger_sources)) {
          const triggerResult = TriggerSourceSchema.safeParse(stripped.trigger_sources);
          if (!triggerResult.success) {
            errors.push({
              field: 'trigger_sources',
              reason: `The proposed trigger configuration is invalid: ${triggerResult.error.issues.map((i) => i.message).join('; ')}`,
            });
          } else {
            triggerChange = {
              before: triggerSummary(baseline.trigger_sources),
              after: triggerSummary(stripped.trigger_sources),
            };
          }
        }

        let inputChange: { added: string[]; removed: string[] } | undefined = undefined;

        if (!deepEqual(baseline.input_schema, stripped.input_schema)) {
          const inputResult = InputSchemaSchema.safeParse(stripped.input_schema ?? []);
          if (!inputResult.success) {
            errors.push({
              field: 'input_schema',
              reason: `The proposed input configuration is invalid: ${inputResult.error.issues.map((i) => i.message).join('; ')}`,
            });
          } else {
            const currentKeys = (baseline.input_schema ?? []).map((i) => i.key);
            const proposedKeys = (stripped.input_schema ?? []).map((i: InputSchemaItem) => i.key);
            inputChange = {
              added: proposedKeys.filter((k: string) => !currentKeys.includes(k)),
              removed: currentKeys.filter((k) => !proposedKeys.includes(k)),
            };
          }
        }

        if (errors.length > 0) {
          sendError(res, 422, 'PROPOSAL_INVALID', 'Some proposed changes could not be applied', {
            errors,
          });
          return;
        }

        if (stripped.tool_registry) {
          stripped.tool_registry = { tools: validTools };
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
          added: validTools.filter((t) => !currentTools.includes(t)),
          removed: currentTools.filter((t) => !validTools.includes(t)),
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
        const response: Record<string, unknown> = {
          baseline: applyAllowlist(baseline),
          proposal: stripped,
          changed_fields: changedFields,
        };

        if (noChange) {
          response['no_change'] = true;
        }

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
