import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  hasTenantPermission,
  PERMISSIONS,
} from '../../../src/lib/auth/permissions.js';
import { Role, TenantRole } from '@prisma/client';

describe('hasPermission (global Role)', () => {
  it('PLATFORM_OWNER has all permissions', () => {
    for (const perm of Object.values(PERMISSIONS)) {
      expect(hasPermission(Role.PLATFORM_OWNER, perm)).toBe(true);
    }
  });

  it('VIEWER has no write permissions', () => {
    expect(hasPermission(Role.VIEWER, PERMISSIONS.MANAGE_TENANTS)).toBe(false);
    expect(hasPermission(Role.VIEWER, PERMISSIONS.MANAGE_MEMBERS)).toBe(false);
    expect(hasPermission(Role.VIEWER, PERMISSIONS.MANAGE_ARCHETYPES)).toBe(false);
  });

  it('VIEWER has read-only permissions', () => {
    expect(hasPermission(Role.VIEWER, PERMISSIONS.READ_TENANT)).toBe(true);
    expect(hasPermission(Role.VIEWER, PERMISSIONS.READ_TASKS)).toBe(true);
  });

  it('ADMIN has manage archetypes but not manage tenants', () => {
    expect(hasPermission(Role.ADMIN, PERMISSIONS.MANAGE_ARCHETYPES)).toBe(true);
    expect(hasPermission(Role.ADMIN, PERMISSIONS.MANAGE_TENANTS)).toBe(false);
  });

  it('USER can trigger employees', () => {
    expect(hasPermission(Role.USER, PERMISSIONS.TRIGGER_EMPLOYEE)).toBe(true);
  });

  it('EDITOR can manage archetypes and KB', () => {
    expect(hasPermission(Role.EDITOR, PERMISSIONS.MANAGE_ARCHETYPES)).toBe(true);
    expect(hasPermission(Role.EDITOR, PERMISSIONS.MANAGE_KB)).toBe(true);
  });

  it('EDITOR cannot trigger employees', () => {
    expect(hasPermission(Role.EDITOR, PERMISSIONS.TRIGGER_EMPLOYEE)).toBe(false);
  });
});

describe('hasTenantPermission (TenantRole)', () => {
  it('OWNER can manage members and invite', () => {
    expect(hasTenantPermission(TenantRole.OWNER, PERMISSIONS.MANAGE_MEMBERS)).toBe(true);
    expect(hasTenantPermission(TenantRole.OWNER, PERMISSIONS.INVITE_MEMBERS)).toBe(true);
  });

  it('OWNER can delete tenant and manage secrets', () => {
    expect(hasTenantPermission(TenantRole.OWNER, PERMISSIONS.DELETE_TENANT)).toBe(true);
    expect(hasTenantPermission(TenantRole.OWNER, PERMISSIONS.MANAGE_SECRETS)).toBe(true);
    expect(hasTenantPermission(TenantRole.OWNER, PERMISSIONS.MANAGE_INTEGRATIONS)).toBe(true);
  });

  it('ADMIN can invite but not delete tenant', () => {
    expect(hasTenantPermission(TenantRole.ADMIN, PERMISSIONS.INVITE_MEMBERS)).toBe(true);
    expect(hasTenantPermission(TenantRole.ADMIN, PERMISSIONS.DELETE_TENANT)).toBe(false);
  });

  it('ADMIN cannot manage secrets or integrations', () => {
    expect(hasTenantPermission(TenantRole.ADMIN, PERMISSIONS.MANAGE_SECRETS)).toBe(false);
    expect(hasTenantPermission(TenantRole.ADMIN, PERMISSIONS.MANAGE_INTEGRATIONS)).toBe(false);
  });

  it('ADMIN can manage archetypes, rules, KB, locks, projects', () => {
    expect(hasTenantPermission(TenantRole.ADMIN, PERMISSIONS.MANAGE_ARCHETYPES)).toBe(true);
    expect(hasTenantPermission(TenantRole.ADMIN, PERMISSIONS.MANAGE_RULES)).toBe(true);
    expect(hasTenantPermission(TenantRole.ADMIN, PERMISSIONS.MANAGE_KB)).toBe(true);
    expect(hasTenantPermission(TenantRole.ADMIN, PERMISSIONS.MANAGE_LOCKS)).toBe(true);
    expect(hasTenantPermission(TenantRole.ADMIN, PERMISSIONS.MANAGE_PROJECTS)).toBe(true);
  });

  it('MEMBER can trigger employees', () => {
    expect(hasTenantPermission(TenantRole.MEMBER, PERMISSIONS.TRIGGER_EMPLOYEE)).toBe(true);
  });

  it('MEMBER cannot manage members', () => {
    expect(hasTenantPermission(TenantRole.MEMBER, PERMISSIONS.MANAGE_MEMBERS)).toBe(false);
  });

  it('MEMBER cannot manage archetypes or secrets', () => {
    expect(hasTenantPermission(TenantRole.MEMBER, PERMISSIONS.MANAGE_ARCHETYPES)).toBe(false);
    expect(hasTenantPermission(TenantRole.MEMBER, PERMISSIONS.MANAGE_SECRETS)).toBe(false);
  });

  it('VIEWER can only read', () => {
    expect(hasTenantPermission(TenantRole.VIEWER, PERMISSIONS.READ_TENANT)).toBe(true);
    expect(hasTenantPermission(TenantRole.VIEWER, PERMISSIONS.READ_TASKS)).toBe(true);
    expect(hasTenantPermission(TenantRole.VIEWER, PERMISSIONS.TRIGGER_EMPLOYEE)).toBe(false);
    expect(hasTenantPermission(TenantRole.VIEWER, PERMISSIONS.MANAGE_MEMBERS)).toBe(false);
    expect(hasTenantPermission(TenantRole.VIEWER, PERMISSIONS.MANAGE_ARCHETYPES)).toBe(false);
  });

  it('MEMBER can read tenant and tasks', () => {
    expect(hasTenantPermission(TenantRole.MEMBER, PERMISSIONS.READ_TENANT)).toBe(true);
    expect(hasTenantPermission(TenantRole.MEMBER, PERMISSIONS.READ_TASKS)).toBe(true);
  });
});
