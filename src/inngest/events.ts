/**
 * Typed event schemas for the AI Employee platform.
 * Canonical source for all Inngest event data shapes.
 *
 * Inngest v4 removed EventSchemas from v3. Type event parameters with EventPayload<TData>:
 *   async ({ event }: { event: EventPayload<RuleExtractRequestedPayload>; step: InngestStep }) => { ... }
 */
export interface InteractionReceivedData {
  source: 'thread_reply' | 'mention';
  text: string;
  userId: string;
  channelId: string;
  threadTs?: string;
  messageTs?: string;
  taskId?: string;
  tenantId?: string;
  team?: string;
}

export interface TaskRequestedData {
  tenantId: string | null;
  text: string;
  userId: string;
  channelId: string;
  archetypeId: string | null;
  threadTs?: string;
  messageTs?: string;
  taskId?: string;
}

interface RequiredInputField {
  key: string;
  label: string;
  description?: string;
  type?: string;
  options?: string[];
}

interface PendingInputContext {
  archetypeId: string;
  tenantId: string;
  userId: string;
  channelId: string;
  text: string;
  roleName: string;
  requiredInputs: RequiredInputField[];
  extractedInputs?: Record<string, string>;
}

export interface TriggerInputReceivedData {
  threadTs: string;
  text: string;
  tenantId: string;
  pending: PendingInputContext;
}

export interface RuleSynthesizeRequestedData {
  tenantId: string;
  archetypeId: string;
  triggerRuleId: string;
}
