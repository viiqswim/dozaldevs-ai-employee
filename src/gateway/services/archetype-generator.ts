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
  buildConnectedAppsBlock,
  CODE_EMPLOYEE_PLATFORM_RULES_OVERRIDE,
} from './prompts/archetype-generator-prompts.js';
export { CODE_EMPLOYEE_PLATFORM_RULES_OVERRIDE };

const log = createLogger('archetype-generator');

export interface GenerateArchetypeResponse {
  role_name: string;
  model: string;
  runtime: 'opencode';
  identity: string;
  execution_steps: string;
  delivery_steps: string | null;
  delivery_instructions: string | null;
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

function stripFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}

function toKebabCase(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

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

  if (!result.role_name || typeof result.role_name !== 'string') {
    result.role_name = toKebabCase(description.split(' ').slice(0, 4).join(' '));
  } else {
    result.role_name = toKebabCase(result.role_name as string);
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
  constructor(private readonly callLLMFn: typeof callLLM) {}

  private async callLLMWithJsonRetry(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    options: {
      taskType: 'triage' | 'execution' | 'review';
      temperature: number;
      maxTokens: number;
    },
  ): Promise<string> {
    const result = await this.callLLMFn({ ...options, messages });
    const raw = stripFences(result.content);
    try {
      JSON.parse(raw);
      return raw;
    } catch (firstError) {
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
      const retryRaw = stripFences(retryResult.content);
      JSON.parse(retryRaw); // throws if still invalid
      return retryRaw;
    }
  }

  private async applyModelAndEstimate(
    result: GenerateArchetypeResponse,
    catalog?: ModelCatalogRow[],
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
  ): Promise<GenerateArchetypeResponse> {
    log.info({ descriptionLength: description.length }, 'Generating archetype from description');

    const systemPrompt = await buildSystemPrompt(
      composioContext?.connectedToolkits ?? [],
      composioContext?.connectableToolkits ?? [],
    );

    const llmOptions = { taskType: 'review' as const, temperature: 0.3, maxTokens: 6000 };
    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `<user_description>${description}</user_description>` },
    ];

    let parsed: unknown;
    try {
      const stripped = await this.callLLMWithJsonRetry(messages, llmOptions);
      parsed = JSON.parse(stripped);
    } catch (err) {
      log.error({ err }, 'GENERATION_FAILED: JSON parse error');
      throw new Error(`GENERATION_FAILED: LLM returned invalid JSON — ${String(err)}`);
    }

    const result = postProcess(parsed, description);
    await this.applyModelAndEstimate(result, catalog);
    return result;
  }

  async refine(
    previousConfig: GenerateArchetypeResponse,
    refinementInstruction: string,
    catalog?: ModelCatalogRow[],
    composioContext?: { connectedToolkits?: string[]; connectableToolkits?: string[] },
  ): Promise<GenerateArchetypeResponse> {
    log.info(
      { roleName: previousConfig.role_name, instructionLength: refinementInstruction.length },
      'Refining archetype config',
    );

    const systemPrompt = await buildRefineSystemPrompt(
      composioContext?.connectedToolkits ?? [],
      composioContext?.connectableToolkits ?? [],
    );

    const llmOptions = { taskType: 'review' as const, temperature: 0.3, maxTokens: 6000 };
    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Current configuration:\n${JSON.stringify(previousConfig, null, 2)}\n\nRefinement instruction:\n<user_description>${refinementInstruction}</user_description>`,
      },
    ];

    let parsed: unknown;
    try {
      const stripped = await this.callLLMWithJsonRetry(messages, llmOptions);
      parsed = JSON.parse(stripped);
    } catch (err) {
      log.error({ err }, 'GENERATION_FAILED: JSON parse error during refine');
      throw new Error(
        `GENERATION_FAILED: LLM returned invalid JSON during refinement — ${String(err)}`,
      );
    }

    const result = postProcess(parsed, previousConfig.role_name);
    await this.applyModelAndEstimate(result, catalog);
    return result;
  }
}
