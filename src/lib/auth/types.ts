import { Role, TenantRole } from '@prisma/client';

export { Role, TenantRole };

export interface SupabaseJwtClaims {
  sub: string;
  email?: string;
  role: string;
  aud: string;
  exp: number;
  iat: number;
  app_metadata?: {
    provider?: string;
    providers?: string[];
  };
  user_metadata?: Record<string, unknown>;
  session_id?: string;
  is_anonymous?: boolean;
}

export interface AuthenticatedUser {
  id: string;
  supabaseId: string;
  email: string;
  name: string | null;
  globalRole: Role;
  status: string;
}

export interface TenantContext {
  tenantId: string;
  tenantRole: TenantRole;
}
