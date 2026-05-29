export const SLACK_ACTION_ID = {
  APPROVE: 'approve',
  REJECT: 'reject',
  GUEST_APPROVE: 'guest_approve',
  GUEST_EDIT: 'guest_edit',
  GUEST_REJECT: 'guest_reject',
  EDITED_DRAFT: 'edited_draft',
  OVERRIDE_TAKE_ACTION: 'override_take_action',
  OVERRIDE_DISMISS: 'override_dismiss',
  RULE_CONFIRM: 'rule_confirm',
  RULE_REJECT: 'rule_reject',
  RULE_REPHRASE: 'rule_rephrase',
} as const;

export type SlackActionId = (typeof SLACK_ACTION_ID)[keyof typeof SLACK_ACTION_ID];
