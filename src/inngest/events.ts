/**
 * Typed event schemas for the AI Employee platform.
 * Canonical source for all Inngest event data shapes.
 *
 * Inngest v4 removed EventSchemas from v3. Type event parameters with EventPayload<TData>:
 *   async ({ event }: { event: EventPayload<RuleExtractRequestedPayload>; step: InngestStep }) => { ... }
 */
import type { RuleExtractRequestedPayload } from './rule-extractor-types.js';

export type { RuleExtractRequestedPayload };

export interface TaskDispatchedData {
  taskId: string;
  archetypeId: string;
}

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

export interface ApprovalReceivedData {
  taskId: string;
  action: 'approve' | 'reject' | 'superseded';
  userId: string;
  userName: string;
  editedContent?: string;
  rejectionReason?: string;
}

export interface OverrideRequestedData {
  taskId: string;
  direction: string | null;
  userId: string;
  userName: string;
}

export interface RequiredInputField {
  key: string;
  label: string;
  description?: string;
  type?: string;
  options?: string[];
}

export interface PendingInputContext {
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

export type { RuleExtractRequestedPayload as RuleExtractRequestedData };

export interface RuleSynthesizeRequestedData {
  tenantId: string;
  archetypeId: string;
  triggerRuleId: string;
}

export interface RuleConfirmedData {
  ruleId: string;
  tenantId: string;
  archetypeId: string;
  confirmedBy: string;
}

export type PlatformEventName =
  | 'employee/task.dispatched'
  | 'employee/interaction.received'
  | 'employee/task.requested'
  | 'employee/approval.received'
  | 'employee/override.requested'
  | 'employee/trigger.input-received'
  | 'employee/rule.extract-requested'
  | 'employee/rule.synthesize-requested'
  | 'employee/rule.confirmed';
