// Inngest event type definitions for the feedback pipeline

export interface RuleConfirmedEvent {
  name: 'employee/rule.confirmed';
  data: {
    ruleId: string;
    tenantId: string;
    archetypeId: string;
    confirmedBy: string; // Slack user ID
  };
}

export interface SynthesisRequestedEvent {
  name: 'employee/rule.synthesize-requested';
  data: {
    tenantId: string;
    archetypeId: string;
    triggerRuleId: string; // the Nth rule that triggered synthesis
  };
}

// Status literal types
export type RuleStatus = 'proposed' | 'confirmed' | 'awaiting_input' | 'archived';
export type RuleSource = 'edit_diff' | 'rejection' | 'thread_reply' | 'mention' | 'synthesis';
export type FeedbackEventType =
  | 'edit_diff'
  | 'rejection'
  | 'rejection_reason'
  | 'thread_reply'
  | 'mention';
