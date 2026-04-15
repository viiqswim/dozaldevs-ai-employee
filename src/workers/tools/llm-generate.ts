import { callLLM } from '../../lib/call-llm.js';
import type { ToolDefinition, ToolContext } from './types.js';

interface LlmGenerateParams {
  system_prompt: string;
  user_prompt: string;
  model?: string;
}

interface LlmGenerateResult {
  text: string;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export const llmGenerateTool: ToolDefinition<LlmGenerateParams, LlmGenerateResult> = {
  name: 'llm.generate',
  async execute(params, ctx: ToolContext): Promise<LlmGenerateResult> {
    const model =
      params.model ?? ctx.env['OPENROUTER_MODEL'] ?? 'anthropic/claude-sonnet-4-20250514';

    const result = await callLLM({
      model,
      messages: [
        { role: 'system', content: params.system_prompt },
        { role: 'user', content: params.user_prompt },
      ],
      taskType: 'execution',
      taskId: ctx.taskId,
    });

    return {
      text: result.content,
      model: result.model,
      usage: {
        prompt_tokens: result.promptTokens,
        completion_tokens: result.completionTokens,
      },
    };
  },
};
