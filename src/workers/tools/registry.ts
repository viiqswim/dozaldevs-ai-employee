import type { ToolDefinition } from './types.js';
import { llmGenerateTool } from './llm-generate.js';
import { slackReadChannelsTool } from './slack-read-channels.js';
import { slackPostMessageTool } from './slack-post-message.js';

export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  'llm.generate': llmGenerateTool as unknown as ToolDefinition,
  'slack.readChannels': slackReadChannelsTool as unknown as ToolDefinition,
  'slack.postMessage': slackPostMessageTool as unknown as ToolDefinition,
};
