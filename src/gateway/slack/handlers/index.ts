import type { App } from '@slack/bolt';
import type { InngestLike } from '../../types.js';
import { registerEventHandlers } from './event-handlers.js';
import { registerApprovalHandlers } from './approval-handlers.js';
import { registerGuestHandlers } from './guest-handlers.js';
import { registerRuleHandlers } from './rule-handlers.js';
import { registerTriggerHandlers } from './trigger-handlers.js';

export { _clearPendingInputCollections } from './shared.js';
export { _clearRecentMentions } from './shared.js';

export function registerSlackHandlers(boltApp: App, inngest: InngestLike): void {
  registerEventHandlers(boltApp, inngest);
  registerApprovalHandlers(boltApp, inngest);
  registerGuestHandlers(boltApp, inngest);
  registerRuleHandlers(boltApp, inngest);
  registerTriggerHandlers(boltApp, inngest);
}
