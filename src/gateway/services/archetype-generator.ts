import path from 'path';
import { z } from 'zod';
import type { callLLM } from '../../lib/call-llm.js';
import { createLogger } from '../../lib/logger.js';
import type { InputSchemaItem } from '../validation/schemas.js';
import type { ModelRecommendation } from '../../lib/model-selection/types.js';
import type { ModelCatalogRow } from '../../lib/model-selection/matcher.js';
import { analyzeArchetype } from '../../lib/model-selection/profiler.js';
import { recommendModels } from '../../lib/model-selection/matcher.js';
import { TimeEstimator } from './time-estimator.js';
import { discoverTools, type ToolMetadata } from './tool-parser.js';
import {
  SYSTEM_PROMPT_PRE,
  SYSTEM_PROMPT_POST,
  REFINE_SYSTEM_PROMPT_PRE,
  REFINE_SYSTEM_PROMPT_POST,
  buildConverseSystemPromptPre,
  CONVERSE_SYSTEM_PROMPT_POST,
  buildConnectedAppsBlock,
  CODE_EMPLOYEE_PLATFORM_RULES_OVERRIDE,
  PLUMBING_JUDGE_SYSTEM_PROMPT,
} from './prompts/archetype-generator-prompts.js';
import type {
  ArchetypeGenerationCallRepository,
  RecordInput,
} from '../../repositories/ArchetypeGenerationCallRepository.js';
import { DEFAULT_DELIVERY_INSTRUCTIONS } from '../../lib/output-contract-constants.js';
export { CODE_EMPLOYEE_PLATFORM_RULES_OVERRIDE };

// ---------------------------------------------------------------------------
// Converse types
// ---------------------------------------------------------------------------

export interface ConverseMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type ConverseResult =
  | { kind: 'question'; question: string }
  | {
      kind: 'proposal';
      baseline: GenerateArchetypeResponse;
      proposal: GenerateArchetypeResponse;
      changed_fields: Record<string, { from: unknown; to: unknown }>;
      tool_delta?: { added: string[]; removed: string[] };
      trigger_change?: { from: unknown; to: unknown };
      input_change?: { from: unknown; to: unknown };
      approval_warning?: boolean;
    }
  | { kind: 'no_change' }
  | { kind: 'too_long' };

const log = createLogger('archetype-generator');

export interface GenerateArchetypeResponse {
  role_name: string;
  model: string;
  runtime: 'opencode';
  identity: string;
  execution_steps: string;
  delivery_steps: string | null;
  instructions: string;
  deliverable_type: string | null;
  input_schema?: InputSchemaItem[];
  risk_model: {
    approval_required: boolean;
    timeout_hours: number;
  };
  trigger_sources: {
    type: 'manual' | 'scheduled' | 'webhook';
    cron?: string;
    timezone?: string;
    event_type?: string;
  };
  tool_registry: {
    tools: string[];
  };
  concurrency_limit: number;
  vm_size?: string | null;
  worker_env?: Record<string, string> | null;
  platform_rules_override?: string | null;
  modelRecommendation?: ModelRecommendation;
  estimated_manual_minutes: number | null;
  overview: {
    role: string;
    trigger: string;
    workflow: string[];
    tools_used: string;
    output: string;
    approval: string;
  };
}

const CODE_PHRASE_PATTERNS: RegExp[] = [
  /\bgithub\b/i,
  /\brepository\b/i,
  /\brepo\b/i,
  /\bpull request\b/i,
  /\bpull requests\b/i,
  /\bbug fix\b/i,
  /\bbugfix\b/i,
  /\bcommit\b/i,
  /\bbranch\b/i,
  /\bwrite code\b/i,
  /\bimplement\b/i,
  /\bprogramming\b/i,
  /\bsoftware engineer\b/i,
  /\btypescript\b/i,
  /\bjavascript\b/i,
  /\bpython\b/i,
  /\brefactor\b/i,
  /\bcode review\b/i,
  /\bcodebase\b/i,
  /\bwrite.*code\b/i,
];

export function isCodeWritingEmployee(description: string): boolean {
  return CODE_PHRASE_PATTERNS.some((pattern) => pattern.test(description));
}

function formatToolCatalog(tools: ToolMetadata[]): string {
  if (tools.length === 0) return '';

  const lines: string[] = [
    '## Available Tools',
    'Use ONLY the following tool paths. Do NOT invent tool paths that are not in this list. ALWAYS include /tools/platform/submit-output.ts in tool_registry.',
    '',
  ];

  for (const tool of tools) {
    lines.push(`### ${tool.containerPath}`);
    lines.push(`Description: ${tool.description}`);

    const requiredFlags = tool.flags.filter((f) => f.required).map((f) => f.name);
    const optionalFlags = tool.flags.filter((f) => !f.required).map((f) => f.name);

    if (requiredFlags.length > 0) {
      lines.push(`Required flags: ${requiredFlags.join(', ')}`);
    }
    if (optionalFlags.length > 0) {
      lines.push(`Optional flags: ${optionalFlags.join(', ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function buildSystemPrompt(
  connectedToolkits: string[] = [],
  connectableToolkits: string[] = [],
): Promise<string> {
  const connectedAppsBlock = buildConnectedAppsBlock(connectedToolkits, connectableToolkits);

  try {
    const basePath = path.join(process.cwd(), 'src/worker-tools');
    const tools = await discoverTools(basePath);
    const catalogSection = formatToolCatalog(tools);
    if (!catalogSection) {
      log.warn('discoverTools returned no tools — using base system prompt without tool catalog');
      return SYSTEM_PROMPT_PRE + '\n\n' + connectedAppsBlock + '\n\n' + SYSTEM_PROMPT_POST;
    }
    return (
      SYSTEM_PROMPT_PRE +
      '\n\n' +
      connectedAppsBlock +
      '\n\n' +
      catalogSection +
      '\n' +
      SYSTEM_PROMPT_POST
    );
  } catch (err) {
    log.warn(
      { err },
      'discoverTools failed — falling back to base system prompt without tool catalog',
    );
    return SYSTEM_PROMPT_PRE + '\n\n' + connectedAppsBlock + '\n\n' + SYSTEM_PROMPT_POST;
  }
}

async function buildRefineSystemPrompt(
  connectedToolkits: string[] = [],
  connectableToolkits: string[] = [],
): Promise<string> {
  const connectedAppsBlock = buildConnectedAppsBlock(connectedToolkits, connectableToolkits);

  try {
    const basePath = path.join(process.cwd(), 'src/worker-tools');
    const tools = await discoverTools(basePath);
    const catalogSection = formatToolCatalog(tools);
    if (!catalogSection) {
      log.warn('discoverTools returned no tools — using base refine prompt without tool catalog');
      return (
        REFINE_SYSTEM_PROMPT_PRE + '\n\n' + connectedAppsBlock + '\n\n' + REFINE_SYSTEM_PROMPT_POST
      );
    }
    return (
      REFINE_SYSTEM_PROMPT_PRE +
      '\n\n' +
      connectedAppsBlock +
      '\n\n' +
      catalogSection +
      '\n' +
      REFINE_SYSTEM_PROMPT_POST
    );
  } catch (err) {
    log.warn(
      { err },
      'discoverTools failed — falling back to base refine prompt without tool catalog',
    );
    return (
      REFINE_SYSTEM_PROMPT_PRE + '\n\n' + connectedAppsBlock + '\n\n' + REFINE_SYSTEM_PROMPT_POST
    );
  }
}

async function buildConverseSystemPrompt(
  connectedToolkits: string[] = [],
  connectableToolkits: string[] = [],
  isCreate: boolean = false,
): Promise<string> {
  const connectedAppsBlock = buildConnectedAppsBlock(connectedToolkits, connectableToolkits);
  const promptPre = buildConverseSystemPromptPre(isCreate);

  try {
    const basePath = path.join(process.cwd(), 'src/worker-tools');
    const tools = await discoverTools(basePath);
    const catalogSection = formatToolCatalog(tools);
    if (!catalogSection) {
      log.warn('discoverTools returned no tools — using base converse prompt without tool catalog');
      return promptPre + '\n\n' + connectedAppsBlock + '\n\n' + CONVERSE_SYSTEM_PROMPT_POST;
    }
    return (
      promptPre +
      '\n\n' +
      connectedAppsBlock +
      '\n\n' +
      catalogSection +
      '\n' +
      CONVERSE_SYSTEM_PROMPT_POST
    );
  } catch (err) {
    log.warn(
      { err },
      'discoverTools failed — falling back to base converse prompt without tool catalog',
    );
    return promptPre + '\n\n' + connectedAppsBlock + '\n\n' + CONVERSE_SYSTEM_PROMPT_POST;
  }
}

const CONVERSE_TOKEN_BUDGET = 60_000;

function stripFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}

/**
 * Repair raw control characters (newline, tab, CR) inside JSON string values.
 *
 * LLMs sometimes emit literal newlines/tabs inside JSON string values without
 * escaping them, causing `SyntaxError: Unterminated string`. This function
 * walks the raw JSON with a state machine that tracks whether the cursor is
 * inside a JSON string, and replaces unescaped control characters with their
 * proper JSON escape sequences (`\n`, `\t`, `\r`).
 *
 * Conservative: never alters content outside string values (keys, numbers,
 * punctuation). If the repaired string still fails to parse, the caller
 * receives the original — no false "success".
 *
 * Exported so unit tests (T5) can import it directly.
 */
export function repairJsonStrings(raw: string): string {
  if (raw.length === 0) return raw;

  const out: string[] = [];
  let inString = false;
  let i = 0;

  while (i < raw.length) {
    const ch = raw[i];

    if (inString) {
      if (ch === '\\') {
        // Escape sequence — copy the backslash and the next char verbatim, then skip both.
        // This handles \" (escaped quote, does NOT end the string) and \\ (escaped backslash).
        out.push(ch);
        if (i + 1 < raw.length) {
          out.push(raw[i + 1]);
          i += 2;
        } else {
          i += 1;
        }
        continue;
      } else if (ch === '"') {
        // Unescaped quote — end of string value.
        inString = false;
        out.push(ch);
      } else if (ch === '\n') {
        // Raw newline inside a JSON string — replace with escape sequence.
        out.push('\\n');
      } else if (ch === '\r') {
        // Raw carriage return inside a JSON string — replace with escape sequence.
        out.push('\\r');
      } else if (ch === '\t') {
        // Raw tab inside a JSON string — replace with escape sequence.
        out.push('\\t');
      } else {
        out.push(ch);
      }
    } else {
      if (ch === '"') {
        // Start of a JSON string value (or key).
        inString = true;
        out.push(ch);
      } else {
        out.push(ch);
      }
    }

    i += 1;
  }

  return out.join('');
}

function toKebabCase(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Keywords that indicate execution_steps reference a Composio-connected app.
// When any keyword matches, /tools/composio/execute.ts is auto-attached to tool_registry.
const COMPOSIO_APP_KEYWORDS = [
  'notion',
  'google sheet',
  'google doc',
  'google drive',
  'google calendar',
  'gmail',
  'linear',
  'jira',
  'airtable',
  'asana',
  'trello',
  'hubspot',
  'salesforce',
  'confluence',
  'monday',
  'clickup',
];

// Failure signals a normalization regression, not bad user input — warn, don't throw.
const PostProcessedArchetypeSchema = z.object({
  role_name: z.string(),
  runtime: z.literal('opencode'),
  identity: z.string(),
  execution_steps: z.string(),
  instructions: z.string(),
  tool_registry: z.object({ tools: z.array(z.string()) }),
  overview: z.object({}).passthrough(),
});

function postProcess(raw: unknown, description: string): GenerateArchetypeResponse {
  const result = raw as Record<string, unknown>;

  result.runtime = 'opencode';

  if (typeof result.execution_steps !== 'string') {
    result.execution_steps = '';
  }
  result.instructions = result.execution_steps;

  if (typeof result.identity !== 'string') {
    result.identity = '';
  }

  if (result.delivery_steps !== null && typeof result.delivery_steps !== 'string') {
    result.delivery_steps = null;
  }
  // Always derive a default — even when deliverable_type is null. Closing this null/null
  // case is the point: it removes the escape hatch so every employee gets a delivery phase
  // and can be switched to require approval later. Do NOT revert to null-passthrough.
  const normalizedDeliverySteps = result.delivery_steps as string | null;
  if (normalizedDeliverySteps === null || normalizedDeliverySteps.trim().length === 0) {
    result.delivery_steps = DEFAULT_DELIVERY_INSTRUCTIONS;
  }

  if (Array.isArray(result['input_schema'])) {
    const filtered = (result['input_schema'] as Array<{ key: string }>).filter(
      (item) => !/slack.*channel|channel.*slack|notification_channel/i.test(item.key),
    );
    if (filtered.length === 0) {
      delete result['input_schema'];
    } else {
      result['input_schema'] = filtered;
    }
  }

  const toolRegistry = result.tool_registry as { tools: unknown[] } | null | undefined;
  if (toolRegistry && Array.isArray(toolRegistry.tools)) {
    toolRegistry.tools = toolRegistry.tools
      .filter((t): t is string => typeof t === 'string')
      .map((t) => {
        const normalized = t.replace(/^tsx\s+/, '');
        if (normalized.startsWith('/tools/')) return normalized;
        const parts = normalized.split('/');
        if (parts.length === 2) {
          const [service, tool] = parts;
          return `/tools/${service}/${tool}.ts`;
        }
        return normalized;
      });
  }

  if (typeof result.execution_steps === 'string') {
    const stepsLower = result.execution_steps.toLowerCase();
    const hasComposioKeyword = COMPOSIO_APP_KEYWORDS.some((kw) => stepsLower.includes(kw));
    if (hasComposioKeyword) {
      const composioTool = '/tools/composio/execute.ts';
      const registry = result.tool_registry as { tools: string[] } | null | undefined;
      if (registry && Array.isArray(registry.tools)) {
        if (!registry.tools.includes(composioTool)) {
          registry.tools.push(composioTool);
        }
      } else {
        result.tool_registry = { tools: ['/tools/platform/submit-output.ts', composioTool] };
      }
    }
  }

  const rawTrigger = result.trigger_sources as Record<string, unknown> | null | undefined;
  if (rawTrigger && typeof rawTrigger === 'object') {
    const type = rawTrigger.type;
    if (type === 'cron' || type === 'cron_and_webhook') {
      const cronExpr = (rawTrigger.expression ?? rawTrigger.cron_expression ?? rawTrigger.cron) as
        | string
        | undefined;
      result.trigger_sources = cronExpr
        ? { type: 'scheduled', cron: cronExpr }
        : { type: 'manual' };
    } else if (type === 'scheduled') {
      const cronExpr = (rawTrigger.cron ?? rawTrigger.expression ?? rawTrigger.cron_expression) as
        | string
        | undefined;
      result.trigger_sources = cronExpr
        ? {
            type: 'scheduled',
            cron: cronExpr,
            ...(rawTrigger.timezone ? { timezone: rawTrigger.timezone as string } : {}),
          }
        : { type: 'manual' };
    } else if (type !== 'manual' && type !== 'webhook') {
      result.trigger_sources = { type: 'manual' };
    }
  }

  if (!result.role_name || typeof result.role_name !== 'string') {
    const derived = toKebabCase(description.split(' ').slice(0, 4).join(' '));
    result.role_name = derived || 'employee-' + Date.now().toString(36).slice(-4);
  } else {
    const normalized = toKebabCase(result.role_name as string);
    result.role_name = normalized || 'employee-' + Date.now().toString(36).slice(-4);
  }

  if (!result.overview || typeof result.overview !== 'object') {
    result.overview = {
      role: '',
      trigger: '',
      workflow: [],
      tools_used: '',
      output: '',
      approval: '',
    };
  }

  if (isCodeWritingEmployee(description)) {
    result.concurrency_limit = 1;
    result.vm_size = 'performance-1x';
    result.platform_rules_override = CODE_EMPLOYEE_PLATFORM_RULES_OVERRIDE;

    if (!result.worker_env || typeof result.worker_env !== 'object') {
      result.worker_env = { GITHUB_REPO_URL: '' };
    } else {
      const env = result.worker_env as Record<string, string>;
      if (!env['GITHUB_REPO_URL']) {
        env['GITHUB_REPO_URL'] = '';
      }
    }

    if (result.risk_model && typeof result.risk_model === 'object') {
      (result.risk_model as { approval_required: boolean }).approval_required = true;
    }

    const registry = result.tool_registry as { tools: string[] } | null | undefined;
    if (registry && Array.isArray(registry.tools)) {
      const githubTool = '/tools/github/get-token.ts';
      if (!registry.tools.includes(githubTool)) {
        registry.tools.push(githubTool);
      }
    }
  }

  const parsed = PostProcessedArchetypeSchema.safeParse(result);
  if (!parsed.success) {
    log.warn(
      { issues: parsed.error.issues },
      'post-processed archetype failed shape validation — returning anyway',
    );
  }

  return result as unknown as GenerateArchetypeResponse;
}

export class ArchetypeGenerator {
  constructor(
    private readonly callLLMFn: typeof callLLM,
    private readonly repo?: ArchetypeGenerationCallRepository,
  ) {}

  private async _persistCall(input: RecordInput): Promise<void> {
    if (!this.repo) return;
    try {
      await this.repo.record(input);
    } catch (err) {
      log.warn({ err }, 'Failed to persist archetype generation call');
    }
  }

  async judgeProseForPlumbing(
    fields: Record<string, unknown>,
  ): Promise<{ has_leak: boolean; fields: string[]; snippets: string[] }> {
    const SAFE = { has_leak: false, fields: [] as string[], snippets: [] as string[] };

    const serializeOverview = (overview: unknown): Record<string, unknown> => {
      if (!overview || typeof overview !== 'object') return {};
      const ov = overview as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      for (const key of ['role', 'trigger', 'tools_used', 'output', 'approval']) {
        if (typeof ov[key] === 'string') result[key] = ov[key];
      }
      if (Array.isArray(ov['workflow'])) {
        result['workflow'] = ov['workflow'];
      }
      return result;
    };

    const payload: Record<string, unknown> = {};
    for (const key of ['identity', 'execution_steps', 'delivery_steps']) {
      if (typeof fields[key] === 'string') payload[key] = fields[key];
    }
    if (fields['overview']) {
      payload['overview'] = serializeOverview(fields['overview']);
    }

    try {
      const result = await this.callLLMFn({
        taskType: 'review',
        temperature: 0,
        responseFormat: { type: 'json_object' },
        messages: [
          { role: 'system', content: PLUMBING_JUDGE_SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(payload) },
        ],
      });

      let parsed: unknown;
      try {
        parsed = JSON.parse(result.content);
      } catch (parseErr) {
        log.warn({ err: parseErr }, 'judgeProseForPlumbing: failed to parse LLM response JSON');
        return SAFE;
      }

      if (
        parsed === null ||
        typeof parsed !== 'object' ||
        typeof (parsed as Record<string, unknown>)['has_leak'] !== 'boolean' ||
        !Array.isArray((parsed as Record<string, unknown>)['fields']) ||
        !Array.isArray((parsed as Record<string, unknown>)['snippets'])
      ) {
        log.warn({ parsed }, 'judgeProseForPlumbing: unexpected response shape from LLM');
        return SAFE;
      }

      const verdict = parsed as { has_leak: boolean; fields: string[]; snippets: string[] };
      return {
        has_leak: verdict.has_leak,
        fields: verdict.fields,
        snippets: verdict.snippets,
      };
    } catch (err) {
      log.warn({ err }, 'judgeProseForPlumbing: LLM call failed — failing open');
      return SAFE;
    }
  }

  private async callLLMWithJsonRetry(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    options: {
      taskType: 'triage' | 'execution' | 'review';
      temperature: number;
      maxTokens: number;
      responseFormat?: { type: 'json_object' };
    },
    callContext?: {
      callType: 'generate' | 'refine';
      tenantId: string;
      createdBy?: string | null;
    },
  ): Promise<string> {
    let result: Awaited<ReturnType<typeof this.callLLMFn>>;
    let emptyContentRetried = false;
    try {
      result = await this.callLLMFn({ ...options, messages });
    } catch (firstCallErr) {
      if (firstCallErr instanceof Error && firstCallErr.message.includes('empty content')) {
        emptyContentRetried = true;
        log.warn('LLM returned empty content on first call — retrying once with nudge');
        const nudgeMessages = [
          ...messages,
          {
            role: 'user' as const,
            content:
              'Your previous response was empty. Please provide a complete, valid JSON response matching the required schema.',
          },
        ];
        result = await this.callLLMFn({ ...options, messages: nudgeMessages });
      } else {
        throw firstCallErr;
      }
    }

    if (callContext) {
      void this._persistCall({
        tenant_id: callContext.tenantId,
        archetype_id: null,
        call_type: callContext.callType,
        model_requested: null,
        model_actual: result.model,
        prompt: JSON.stringify(messages),
        response: result.content,
        prompt_tokens: result.promptTokens,
        completion_tokens: result.completionTokens,
        estimated_cost_usd: result.estimatedCostUsd,
        latency_ms: result.latencyMs,
        retry_count: emptyContentRetried ? 1 : 0,
        status: 'success',
        created_by: callContext.createdBy ?? null,
      });
    }

    const raw = stripFences(result.content);
    try {
      JSON.parse(raw);
      return raw;
    } catch (firstError) {
      if (raw.length > 0) {
        try {
          const repaired = repairJsonStrings(raw);
          JSON.parse(repaired);
          log.info('JSON parse succeeded after repairJsonStrings — skipping LLM retry');
          return repaired;
        } catch (_e) {
          // repairJsonStrings did not produce valid JSON — fall through to LLM retry
        }
      }

      log.warn({ error: firstError }, 'JSON parse failed on first attempt — retrying with nudge');
      const retryMessages = [
        ...messages,
        { role: 'assistant' as const, content: result.content },
        {
          role: 'user' as const,
          content:
            'Your previous response was not valid JSON. Please respond with ONLY a valid JSON object matching the required schema. No explanations, no markdown, just the JSON.',
        },
      ];
      const retryResult = await this.callLLMFn({ ...options, messages: retryMessages });

      if (callContext) {
        void this._persistCall({
          tenant_id: callContext.tenantId,
          archetype_id: null,
          call_type: callContext.callType,
          model_requested: null,
          model_actual: retryResult.model,
          prompt: JSON.stringify(retryMessages),
          response: retryResult.content,
          prompt_tokens: retryResult.promptTokens,
          completion_tokens: retryResult.completionTokens,
          estimated_cost_usd: retryResult.estimatedCostUsd,
          latency_ms: retryResult.latencyMs,
          retry_count: 1,
          status: 'success',
          created_by: callContext.createdBy ?? null,
        });
      }

      const retryRaw = stripFences(retryResult.content);
      try {
        JSON.parse(retryRaw);
        return retryRaw;
      } catch {
        if (retryRaw.length > 0) {
          const repairedRetry = repairJsonStrings(retryRaw);
          JSON.parse(repairedRetry);
          log.info('JSON parse succeeded after repairJsonStrings on retry result');
          return repairedRetry;
        }
        throw new Error('JSON parse failed on retry result');
      }
    }
  }

  private async applyModelAndEstimate(
    result: GenerateArchetypeResponse,
    catalog?: ModelCatalogRow[],
    generationContext?: { tenantId: string; createdBy?: string | null },
  ): Promise<void> {
    if (catalog && catalog.length > 0) {
      try {
        const profile = analyzeArchetype({
          identity: result.identity,
          instructions: result.execution_steps,
          deliverable_type: result.deliverable_type ?? '',
        });
        const recommendation = recommendModels(profile, catalog);
        result.modelRecommendation = recommendation;
        if (recommendation.recommended) {
          result.model = recommendation.recommended.modelId;
          log.info(
            {
              model: recommendation.recommended.modelId,
              totalScore: recommendation.recommended.totalScore,
            },
            'Model recommendation selected',
          );
        }
        if (generationContext) {
          void this._persistCall({
            tenant_id: generationContext.tenantId,
            archetype_id: null,
            call_type: 'recommend_model',
            model_requested: null,
            model_actual: recommendation.recommended?.modelId ?? null,
            status: 'success',
            created_by: generationContext.createdBy ?? null,
          });
        }
      } catch (err) {
        log.warn({ err }, 'Model recommendation failed — using LLM default model');
      }
    }

    try {
      const estimator = new TimeEstimator(this.callLLMFn);
      const minutes = await estimator.estimate({
        role_name: result.role_name,
        execution_instructions: result.execution_steps,
        deliverable_type: result.deliverable_type,
      });
      result.estimated_manual_minutes = minutes ?? null;
    } catch (err) {
      log.warn({ err }, 'Time estimation failed — setting estimated_manual_minutes to null');
      result.estimated_manual_minutes = null;
    }
  }

  async generate(
    description: string,
    catalog?: ModelCatalogRow[],
    composioContext?: { connectedToolkits?: string[]; connectableToolkits?: string[] },
    generationContext?: { tenantId: string; createdBy?: string | null },
  ): Promise<GenerateArchetypeResponse> {
    log.info({ descriptionLength: description.length }, 'Generating archetype from description');

    const systemPrompt = await buildSystemPrompt(
      composioContext?.connectedToolkits ?? [],
      composioContext?.connectableToolkits ?? [],
    );

    const llmOptions = {
      taskType: 'review' as const,
      temperature: 0.3,
      maxTokens: 6000,
      responseFormat: { type: 'json_object' as const },
    };
    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `<user_description>${description}</user_description>` },
    ];

    const callContext = generationContext
      ? { callType: 'generate' as const, ...generationContext }
      : undefined;

    let parsed: unknown;
    try {
      const stripped = await this.callLLMWithJsonRetry(messages, llmOptions, callContext);
      parsed = JSON.parse(stripped);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isEmptyContent = errMsg.includes('LLM returned empty content');
      log.error(
        { err },
        isEmptyContent ? 'GENERATION_FAILED: empty content' : 'GENERATION_FAILED: JSON parse error',
      );
      if (generationContext) {
        void this._persistCall({
          tenant_id: generationContext.tenantId,
          archetype_id: null,
          call_type: 'generate',
          status: 'failed',
          error_message: errMsg,
          created_by: generationContext.createdBy ?? null,
        });
      }
      if (isEmptyContent) {
        throw new Error(`GENERATION_FAILED: LLM returned no usable content — ${errMsg}`);
      }
      throw new Error(`GENERATION_FAILED: LLM returned invalid JSON — ${errMsg}`);
    }

    const result = postProcess(parsed, description);
    await this.applyModelAndEstimate(result, catalog, generationContext);
    return result;
  }

  async refine(
    previousConfig: GenerateArchetypeResponse,
    refinementInstruction: string,
    catalog?: ModelCatalogRow[],
    composioContext?: { connectedToolkits?: string[]; connectableToolkits?: string[] },
    generationContext?: { tenantId: string; createdBy?: string | null },
  ): Promise<GenerateArchetypeResponse> {
    log.info(
      { roleName: previousConfig.role_name, instructionLength: refinementInstruction.length },
      'Refining archetype config',
    );

    const systemPrompt = await buildRefineSystemPrompt(
      composioContext?.connectedToolkits ?? [],
      composioContext?.connectableToolkits ?? [],
    );

    const llmOptions = {
      taskType: 'review' as const,
      temperature: 0.3,
      maxTokens: 16000,
      responseFormat: { type: 'json_object' as const },
    };

    type Message = { role: 'user' | 'assistant' | 'system'; content: string };

    const refineCallContext = generationContext
      ? { callType: 'refine' as const, ...generationContext }
      : undefined;

    const runRefineCall = async (msgs: Message[]): Promise<GenerateArchetypeResponse> => {
      let parsed: unknown;
      try {
        const stripped = await this.callLLMWithJsonRetry(msgs, llmOptions, refineCallContext);
        parsed = JSON.parse(stripped);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const isEmptyContent = errMsg.includes('LLM returned empty content');
        log.error(
          { err },
          isEmptyContent
            ? 'GENERATION_FAILED: empty content during refine'
            : 'GENERATION_FAILED: JSON parse error during refine',
        );
        if (generationContext) {
          void this._persistCall({
            tenant_id: generationContext.tenantId,
            archetype_id: null,
            call_type: 'refine',
            status: 'failed',
            error_message: errMsg,
            created_by: generationContext.createdBy ?? null,
          });
        }
        if (isEmptyContent) {
          throw new Error(
            `GENERATION_FAILED: LLM returned no usable content during refinement — ${errMsg}`,
          );
        }
        throw new Error(
          `GENERATION_FAILED: LLM returned invalid JSON during refinement — ${errMsg}`,
        );
      }
      const r = postProcess(parsed, previousConfig.role_name);
      await this.applyModelAndEstimate(r, catalog, generationContext);
      return r;
    };

    const baseMessages: Message[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Current configuration:\n${JSON.stringify(previousConfig, null, 2)}\n\nRefinement instruction:\n<user_description>${refinementInstruction}</user_description>`,
      },
    ];

    const result = await runRefineCall(baseMessages);

    // Guard: if the LLM returned prose fields identical to the input, it failed to
    // apply the change. Retry once with an explicit nudge so the model understands it
    // must modify the requested fields. This covers the ~10% of calls where the model
    // echoes back the original config unchanged.
    const proseFields = ['identity', 'execution_steps', 'delivery_steps'] as const;
    const proseUnchanged = proseFields.every(
      (f) => JSON.stringify(result[f]) === JSON.stringify(previousConfig[f]),
    );

    if (proseUnchanged) {
      log.warn(
        { roleName: previousConfig.role_name },
        'refine: prose fields identical to input — retrying with explicit change nudge',
      );
      const nudgeMessages: Message[] = [
        ...baseMessages,
        { role: 'assistant', content: '{}' },
        {
          role: 'user',
          content:
            'Your previous response made no changes to execution_steps, delivery_steps, or identity. ' +
            'You MUST modify the relevant fields to incorporate the requested change. Please try again and make the specific changes the user asked for.',
        },
      ];
      return runRefineCall(nudgeMessages);
    }

    return result;
  }

  async converse(
    transcript: ConverseMessage[],
    currentConfig: GenerateArchetypeResponse,
    catalog?: ModelCatalogRow[],
    composioContext?: { connectedToolkits?: string[]; connectableToolkits?: string[] },
  ): Promise<ConverseResult> {
    const configTokens = JSON.stringify(currentConfig).length / 4;
    const transcriptTokens = transcript.reduce((sum, m) => sum + m.content.length, 0) / 4;
    const estimatedTokens = configTokens + transcriptTokens + 2000;

    if (estimatedTokens > CONVERSE_TOKEN_BUDGET) {
      log.warn({ estimatedTokens }, 'converse: token budget exceeded — returning too_long');
      return { kind: 'too_long' };
    }

    const assistantTurns = transcript.filter((m) => m.role === 'assistant').length;
    const backstopActive = assistantTurns >= 5;

    const isCreate = !currentConfig.role_name;
    const systemPrompt = await buildConverseSystemPrompt(
      composioContext?.connectedToolkits ?? [],
      composioContext?.connectableToolkits ?? [],
      isCreate,
    );

    const transcriptText = transcript.map((m) => `${m.role}: ${m.content}`).join('\n\n');

    const userContent = backstopActive
      ? `IMPORTANT: You have asked enough clarifying questions. You MUST now produce a proposal (your best guess). Do NOT ask another question.\n\nCurrent configuration:\n${JSON.stringify(currentConfig, null, 2)}\n\nConversation history:\n${transcriptText}`
      : `Current configuration:\n${JSON.stringify(currentConfig, null, 2)}\n\nConversation history:\n${transcriptText}`;

    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ];

    const llmOptions = {
      taskType: 'review' as const,
      temperature: 0.3,
      maxTokens: 16000,
      responseFormat: { type: 'json_object' as const },
    };

    let rawJson: string;
    try {
      rawJson = await this.callLLMWithJsonRetry(messages, llmOptions);
    } catch (err) {
      log.error(
        { err, degraded: true, reason: 'llm_call_failed' },
        'converse: degraded to no_change after LLM call failed',
      );
      return { kind: 'no_change' };
    }

    let parsed: { kind?: string; question?: string; config?: unknown };
    try {
      parsed = JSON.parse(rawJson) as { kind?: string; question?: string; config?: unknown };
    } catch {
      log.warn(
        { degraded: true, reason: 'parse_failed' },
        'converse: degraded to no_change after failing to parse LLM response',
      );
      return { kind: 'no_change' };
    }

    const kind = parsed.kind;

    if (backstopActive && kind === 'question') {
      log.warn('converse: backstop active but model returned question — coercing to no_change');
      return { kind: 'no_change' };
    }

    if (kind === 'question') {
      const question = typeof parsed.question === 'string' ? parsed.question : '';
      return { kind: 'question', question };
    }

    if (kind === 'no_change') {
      return { kind: 'no_change' };
    }

    if (kind === 'proposal' && parsed.config !== null && typeof parsed.config === 'object') {
      const roleNameSource = currentConfig.role_name
        ? currentConfig.role_name
        : transcript
            .filter((m) => m.role === 'user')
            .map((m) => m.content)
            .join(' ');
      const processedConfig = postProcess(parsed.config, roleNameSource);
      await this.applyModelAndEstimate(processedConfig, catalog);

      const proseFields = ['identity', 'execution_steps', 'delivery_steps', 'overview'] as const;
      const changed_fields: Record<string, { from: unknown; to: unknown }> = {};
      for (const f of proseFields) {
        if (JSON.stringify(processedConfig[f]) !== JSON.stringify(currentConfig[f])) {
          changed_fields[f] = { from: currentConfig[f], to: processedConfig[f] };
        }
      }
      if (
        processedConfig.risk_model.approval_required !== currentConfig.risk_model.approval_required
      ) {
        changed_fields['risk_model.approval_required'] = {
          from: currentConfig.risk_model.approval_required,
          to: processedConfig.risk_model.approval_required,
        };
      }

      const baseTools = new Set(currentConfig.tool_registry.tools);
      const newTools = new Set(processedConfig.tool_registry.tools);
      const toolAdded = [...newTools].filter((t) => !baseTools.has(t));
      const toolRemoved = [...baseTools].filter((t) => !newTools.has(t));
      const tool_delta =
        toolAdded.length > 0 || toolRemoved.length > 0
          ? { added: toolAdded, removed: toolRemoved }
          : undefined;

      const trigger_change =
        JSON.stringify(processedConfig.trigger_sources) !==
        JSON.stringify(currentConfig.trigger_sources)
          ? { from: currentConfig.trigger_sources, to: processedConfig.trigger_sources }
          : undefined;

      const input_change =
        JSON.stringify(processedConfig.input_schema) !== JSON.stringify(currentConfig.input_schema)
          ? { from: currentConfig.input_schema, to: processedConfig.input_schema }
          : undefined;

      const approval_warning =
        currentConfig.risk_model.approval_required === true &&
        processedConfig.risk_model.approval_required === false
          ? true
          : undefined;

      return {
        kind: 'proposal',
        baseline: currentConfig,
        proposal: processedConfig,
        changed_fields,
        ...(tool_delta !== undefined && { tool_delta }),
        ...(trigger_change !== undefined && { trigger_change }),
        ...(input_change !== undefined && { input_change }),
        ...(approval_warning !== undefined && { approval_warning }),
      };
    }

    log.warn({ kind }, 'converse: unexpected LLM response kind — returning no_change');
    return { kind: 'no_change' };
  }
}
