import { AuthenticatedUser, TenantContext } from './types.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedUser;
      tenantContext?: TenantContext;
      isServiceToken?: boolean;
    }
  }
}
