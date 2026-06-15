import { z } from 'zod';
import { ALL_TOOL_DESCRIPTORS, toolInvocationPath } from '../../lib/tool-registry.js';
import type { ToolDescriptor } from '../../lib/tool-registry.js';
import { InputSchemaSchema } from '../validation/schemas.js';
import type { GenerateArchetypeResponse } from '../services/archetype-generator.js';
import type { InputSchemaItem } from '../validation/schemas.js';

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
  overview?: GenerateArchetypeResponse['overview'];
  risk_model?: { approval_required: boolean; timeout_hours?: number };
  tool_registry?: { tools: string[] };
  trigger_sources?: GenerateArchetypeResponse['trigger_sources'];
  input_schema?: InputSchemaItem[];
}

export type ValidateProposalResult =
  | { ok: true; validTools: string[] }
  | { ok: false; reason: string; errors: Array<{ field: string; reason: string }> };

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

function validateTools(
  proposedTools: string[],
  connectedToolkits: string[],
): { validTools: string[]; rejectedTools: Array<{ tool: string; reason: string }> } {
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
          rejectedTools.push({
            tool,
            reason: `Tool "${tool}" is not a recognised shell tool or connected Composio toolkit.`,
          });
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
  const errors: Array<{ field: string; reason: string }> = [];

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
      errors.push({
        field,
        reason: `The "${field}" field was non-empty but the proposal would make it blank. This is not allowed — please refine your request.`,
      });
    }
  }

  const proposedTools = proposal.tool_registry?.tools ?? [];
  const { validTools, rejectedTools } = validateTools(proposedTools, connectedToolkits);
  for (const { tool, reason } of rejectedTools) {
    errors.push({ field: `tool_registry.tools[${tool}]`, reason });
  }

  if (JSON.stringify(proposal.trigger_sources) !== JSON.stringify(baseline.trigger_sources)) {
    const triggerResult = TriggerSourceSchema.safeParse(proposal.trigger_sources);
    if (!triggerResult.success) {
      errors.push({
        field: 'trigger_sources',
        reason: `The proposed trigger configuration is invalid: ${triggerResult.error.issues.map((i) => i.message).join('; ')}`,
      });
    }
  }

  if (JSON.stringify(proposal.input_schema) !== JSON.stringify(baseline.input_schema)) {
    const inputResult = InputSchemaSchema.safeParse(proposal.input_schema ?? []);
    if (!inputResult.success) {
      errors.push({
        field: 'input_schema',
        reason: `The proposed input configuration is invalid: ${inputResult.error.issues.map((i) => i.message).join('; ')}`,
      });
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      reason: errors.map((e) => `${e.field}: ${e.reason}`).join('; '),
      errors,
    };
  }

  return { ok: true, validTools };
}
