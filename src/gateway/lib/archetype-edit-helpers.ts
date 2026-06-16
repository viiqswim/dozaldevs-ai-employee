import { z } from 'zod';
import { ALL_TOOL_DESCRIPTORS, toolInvocationPath } from '../../lib/tool-registry.js';
import type { ToolDescriptor } from '../../lib/tool-registry.js';
import { InputSchemaItemSchema } from '../validation/schemas.js';
import type { GenerateArchetypeResponse } from '../services/archetype-generator.js';
import type { InputSchemaItem } from '../validation/schemas.js';
import { createLogger, logToolResolution } from '../../lib/logger.js';

const log = createLogger('archetype-edit-helpers');

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

export interface StrippedProposal {
  identity?: string;
  execution_steps?: string;
  delivery_steps?: string | null;
  delivery_instructions?: string | null;
  deliverable_type?: string | null;
  overview?: GenerateArchetypeResponse['overview'];
  risk_model?: { approval_required: boolean; timeout_hours?: number };
  tool_registry?: { tools: string[] };
  trigger_sources?: GenerateArchetypeResponse['trigger_sources'];
  input_schema?: InputSchemaItem[];
}

export type ValidateProposalResult =
  | { ok: true; validTools: string[] }
  | { ok: false; reAsk: true; fields: string[] };

export function mapArchetypeRowToConfig(row: Record<string, unknown>): GenerateArchetypeResponse {
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

export interface ResolveToolPathsResult {
  resolved: string[];
  dropped: Array<{ tool: string; reason: string }>;
}

const COMPOSIO_PATTERN = /^\/tools\/composio\//;

function normalizeToolPath(tool: string): string {
  let path = tool.replace(/^tsx\s+/, '');

  if (!path.startsWith('/')) {
    const parts = path.split('/');
    if (parts.length === 2) {
      return `/tools/${parts[0]}/${parts[1]}.ts`;
    }
    return path;
  }

  if (path.startsWith('/tools/') && !COMPOSIO_PATTERN.test(path) && !/\.\w+$/.test(path)) {
    path = `${path}.ts`;
  }

  return path;
}

export function resolveToolPaths(
  tools: string[],
  descriptors: ToolDescriptor[] = ALL_TOOL_DESCRIPTORS,
  connectedToolkits: string[] = [],
): ResolveToolPathsResult {
  const shellToolPaths = new Set(
    descriptors.map((d) => toolInvocationPath(d).replace(/^tsx /, '')),
  );
  const connectedSet = new Set(connectedToolkits);

  const resolved: string[] = [];
  const dropped: Array<{ tool: string; reason: string }> = [];

  for (const tool of tools) {
    const normalized = normalizeToolPath(tool);

    if (COMPOSIO_PATTERN.test(normalized)) {
      const toolkit = normalized.split('/')[3];
      if (toolkit && connectedSet.has(toolkit)) {
        resolved.push(normalized);
      } else {
        dropped.push({
          tool,
          reason:
            connectedToolkits.length === 0
              ? `Composio tool "${tool}" requires a connected Composio app, but none are connected for this employee.`
              : `Composio toolkit "${toolkit}" is not connected for this employee.`,
        });
      }
    } else if (shellToolPaths.has(normalized)) {
      resolved.push(normalized);
    } else {
      dropped.push({
        tool,
        reason: `Tool "${tool}" is not available. It is not in the platform's tool library and does not match any connected app.`,
      });
    }
  }

  return { resolved, dropped };
}

export function validateProposalFields(
  proposal: StrippedProposal,
  baseline: GenerateArchetypeResponse,
  connectedToolkits: string[],
  _connectableToolkits: string[],
): ValidateProposalResult {
  const blankFields: string[] = [];
  const proseFields = ['identity', 'execution_steps', 'delivery_steps'] as const;
  for (const field of proseFields) {
    const baselineValue = baseline[field];
    const proposedValue = proposal[field];
    const baselineNonEmpty = typeof baselineValue === 'string' && baselineValue.trim().length > 0;
    const proposedEmpty =
      proposedValue === undefined ||
      proposedValue === null ||
      (typeof proposedValue === 'string' && proposedValue.trim().length === 0);
    if (baselineNonEmpty && proposedEmpty) {
      blankFields.push(field);
    }
  }
  if (blankFields.length > 0) {
    return { ok: false, reAsk: true, fields: blankFields };
  }

  const proposedTools = proposal.tool_registry?.tools ?? [];
  const { resolved: validTools, dropped } = resolveToolPaths(
    proposedTools,
    undefined,
    connectedToolkits,
  );
  for (const { tool, reason } of dropped) {
    logToolResolution(log, { originalTool: tool, outcome: 'dropped', reason });
  }

  if (
    proposal.trigger_sources !== undefined &&
    JSON.stringify(proposal.trigger_sources) !== JSON.stringify(baseline.trigger_sources)
  ) {
    const triggerResult = TriggerSourceSchema.safeParse(proposal.trigger_sources);
    if (!triggerResult.success) {
      log.warn(
        { proposedTrigger: proposal.trigger_sources },
        'trigger_sources invalid — coerced to manual',
      );
    }
  }

  if (
    proposal.input_schema !== undefined &&
    JSON.stringify(proposal.input_schema) !== JSON.stringify(baseline.input_schema)
  ) {
    for (const item of proposal.input_schema) {
      const itemResult = InputSchemaItemSchema.safeParse(item);
      if (!itemResult.success) {
        log.warn({ item, issues: itemResult.error.issues }, 'input_schema item invalid — dropped');
      }
    }
  }

  return { ok: true, validTools };
}
