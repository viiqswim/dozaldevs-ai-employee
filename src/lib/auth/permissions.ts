import { Role, TenantRole } from '@prisma/client';

/**
 * All available permission identifiers for role-based access control.
 *
 * Platform-level permissions are checked against the global `Role` (via `hasPermission`).
 * Tenant-level permissions are checked against `TenantRole` (via `hasTenantPermission`).
 */
export const PERMISSIONS = {
  // Platform-level (global Role — cross-tenant)
  MANAGE_TENANTS: 'manage:tenants',
  READ_MODEL_CATALOG: 'read:model_catalog',
  MANAGE_MODEL_CATALOG: 'manage:model_catalog',
  MANAGE_PLATFORM_SETTINGS: 'manage:platform_settings',

  // Tenant-level (TenantRole — scoped to a single tenant)
  READ_TENANT: 'read:tenant',
  UPDATE_TENANT: 'update:tenant',
  DELETE_TENANT: 'delete:tenant',
  MANAGE_SECRETS: 'manage:secrets',
  MANAGE_INTEGRATIONS: 'manage:integrations',
  MANAGE_ARCHETYPES: 'manage:archetypes',
  MANAGE_RULES: 'manage:rules',
  MANAGE_KB: 'manage:kb',
  MANAGE_LOCKS: 'manage:locks',
  MANAGE_PROJECTS: 'manage:projects',
  TRIGGER_EMPLOYEE: 'trigger:employee',
  READ_TASKS: 'read:tasks',
  INVITE_MEMBERS: 'invite:members',
  MANAGE_MEMBERS: 'manage:members',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Maps each global `Role` to its granted permissions.
 *
 * PLATFORM_OWNER has all permissions (cross-tenant superadmin).
 * Uses `Set` for O(1) lookups.
 */
export const ROLE_PERMISSIONS: Record<Role, Set<Permission>> = {
  [Role.PLATFORM_OWNER]: new Set(Object.values(PERMISSIONS) as Permission[]),
  [Role.ADMIN]: new Set<Permission>([
    PERMISSIONS.READ_TENANT,
    PERMISSIONS.READ_MODEL_CATALOG,
    PERMISSIONS.MANAGE_ARCHETYPES,
    PERMISSIONS.MANAGE_RULES,
    PERMISSIONS.MANAGE_KB,
    PERMISSIONS.MANAGE_LOCKS,
    PERMISSIONS.MANAGE_PROJECTS,
    PERMISSIONS.TRIGGER_EMPLOYEE,
    PERMISSIONS.READ_TASKS,
    PERMISSIONS.INVITE_MEMBERS,
  ]),
  [Role.EDITOR]: new Set<Permission>([
    PERMISSIONS.READ_TENANT,
    PERMISSIONS.READ_MODEL_CATALOG,
    PERMISSIONS.MANAGE_ARCHETYPES,
    PERMISSIONS.MANAGE_RULES,
    PERMISSIONS.MANAGE_KB,
    PERMISSIONS.READ_TASKS,
  ]),
  [Role.USER]: new Set<Permission>([
    PERMISSIONS.READ_TENANT,
    PERMISSIONS.READ_MODEL_CATALOG,
    PERMISSIONS.TRIGGER_EMPLOYEE,
    PERMISSIONS.READ_TASKS,
  ]),
  [Role.VIEWER]: new Set<Permission>([PERMISSIONS.READ_TENANT, PERMISSIONS.READ_TASKS]),
};

/**
 * Maps each per-tenant `TenantRole` to its granted permissions.
 *
 * OWNER has all tenant permissions including destructive ops (delete, secrets, integrations).
 * Uses `Set` for O(1) lookups.
 */
export const TENANT_ROLE_PERMISSIONS: Record<TenantRole, Set<Permission>> = {
  [TenantRole.OWNER]: new Set<Permission>([
    PERMISSIONS.READ_TENANT,
    PERMISSIONS.UPDATE_TENANT,
    PERMISSIONS.DELETE_TENANT,
    PERMISSIONS.MANAGE_SECRETS,
    PERMISSIONS.MANAGE_INTEGRATIONS,
    PERMISSIONS.READ_MODEL_CATALOG,
    PERMISSIONS.MANAGE_ARCHETYPES,
    PERMISSIONS.MANAGE_RULES,
    PERMISSIONS.MANAGE_KB,
    PERMISSIONS.MANAGE_LOCKS,
    PERMISSIONS.MANAGE_PROJECTS,
    PERMISSIONS.TRIGGER_EMPLOYEE,
    PERMISSIONS.READ_TASKS,
    PERMISSIONS.INVITE_MEMBERS,
    PERMISSIONS.MANAGE_MEMBERS,
  ]),
  [TenantRole.ADMIN]: new Set<Permission>([
    PERMISSIONS.READ_TENANT,
    PERMISSIONS.UPDATE_TENANT,
    PERMISSIONS.READ_MODEL_CATALOG,
    PERMISSIONS.MANAGE_ARCHETYPES,
    PERMISSIONS.MANAGE_RULES,
    PERMISSIONS.MANAGE_KB,
    PERMISSIONS.MANAGE_LOCKS,
    PERMISSIONS.MANAGE_PROJECTS,
    PERMISSIONS.TRIGGER_EMPLOYEE,
    PERMISSIONS.READ_TASKS,
    PERMISSIONS.INVITE_MEMBERS,
  ]),
  [TenantRole.MEMBER]: new Set<Permission>([
    PERMISSIONS.READ_TENANT,
    PERMISSIONS.TRIGGER_EMPLOYEE,
    PERMISSIONS.READ_TASKS,
  ]),
  [TenantRole.VIEWER]: new Set<Permission>([PERMISSIONS.READ_TENANT, PERMISSIONS.READ_TASKS]),
};

/**
 * Checks whether a global `Role` has a specific permission.
 *
 * @param role - The user's platform-wide role
 * @param permission - The permission to check
 * @returns `true` if the role has the permission
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

/**
 * Checks whether a per-tenant `TenantRole` has a specific permission.
 *
 * @param tenantRole - The user's role within a specific tenant
 * @param permission - The permission to check
 * @returns `true` if the tenant role has the permission
 */
export function hasTenantPermission(tenantRole: TenantRole, permission: Permission): boolean {
  return TENANT_ROLE_PERMISSIONS[tenantRole]?.has(permission) ?? false;
}
