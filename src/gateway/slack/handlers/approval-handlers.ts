import type { App } from '@slack/bolt';
import type { InngestLike } from '../../types.js';
import { registerApproveAction } from './approve-action.js';
import { registerEditAction } from './edit-action.js';
import { registerRejectAction } from './reject-action.js';

export function registerApprovalHandlers(boltApp: App, inngest: InngestLike): void {
  registerApproveAction(boltApp, inngest);
  registerEditAction(boltApp, inngest);
  registerRejectAction(boltApp, inngest);
}
