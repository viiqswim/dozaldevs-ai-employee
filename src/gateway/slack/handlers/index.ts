import type { App } from '@slack/bolt';
import type { InngestLike } from '../../types.js';
import type { PrismaClient } from '@prisma/client';
import { EmployeeRuleRepository } from '../../../repositories/employee-rule-repository.js';
import { registerEventHandlers } from './event-handlers.js';
import { registerApprovalHandlers } from './approval-handlers.js';
import { registerOverrideHandlers } from './override-handlers.js';
import { registerRuleHandlers } from './rule-handlers.js';
import { registerTriggerHandlers } from './trigger-handlers.js';

export { _clearPendingInputCollections } from './shared.js';
export { _clearRecentMentions } from './shared.js';

export function registerSlackHandlers(
  boltApp: App,
  inngest: InngestLike,
  prisma: PrismaClient,
): void {
  const ruleRepo = new EmployeeRuleRepository(prisma);
  registerEventHandlers(boltApp, inngest, prisma);
  registerApprovalHandlers(boltApp, inngest);
  registerOverrideHandlers(boltApp, inngest);
  registerRuleHandlers(boltApp, inngest, ruleRepo);
  registerTriggerHandlers(boltApp, inngest, prisma);
}
