/**
 * Unified payload for the employee/rule.extract-requested event.
 * All three emitters (rejection path, feedback/teaching path, lifecycle edit-diff path)
 * use this shape with explicit nullability.
 */
export interface RuleExtractRequestedPayload {
  tenantId: string;
  feedbackId: string | null;
  feedbackType: 'rejection_reason' | 'edit_diff' | 'feedback' | 'teaching';
  taskId: string | null;
  archetypeId: string | null;
  content: string | null; // raw text — null for feedback/teaching if only feedbackId sent
  originalContent?: string; // for edit_diff: the original draft
  editedContent?: string; // for edit_diff: the edited version
  source?: string; // 'thread_reply' | 'mention' — from interaction handler
}
