import type { App } from '@slack/bolt';
import type { InngestLike } from '../../types.js';
import type { EmployeeRuleRepository } from '../../../repositories/employee-rule-repository.js';
import { registerRuleConfirmAction } from './rule-confirm-action.js';
import { registerRuleRejectAction } from './rule-reject-action.js';
import { registerRuleRephraseAction } from './rule-rephrase-action.js';

export function registerRuleHandlers(
  boltApp: App,
  inngest: InngestLike,
  ruleRepo: EmployeeRuleRepository,
): void {
  registerRuleConfirmAction(boltApp, inngest, ruleRepo);
  registerRuleRejectAction(boltApp, ruleRepo);
  registerRuleRephraseAction(boltApp, ruleRepo);
}
