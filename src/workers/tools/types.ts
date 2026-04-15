import type { Logger } from '../../lib/logger.js';

export interface ToolContext {
  taskId: string;
  env: Record<string, string>; // resolved env vars
  logger: Logger;
  previousResult?: unknown; // result from previous step
}

export interface ToolDefinition<TParams = Record<string, unknown>, TResult = unknown> {
  name: string;
  execute: (params: TParams, ctx: ToolContext) => Promise<TResult>;
}

export interface StepDefinition {
  tool: string;
  params: Record<string, unknown>; // values can contain $ENV_VAR and $prev_result references
}

export interface ArchetypeConfig {
  system_prompt: string;
  tools: string[];
  steps: StepDefinition[];
  model: string;
  deliverable_type: string;
}
