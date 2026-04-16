import { describe, it, expect } from 'vitest';
import {
  TriggerEmployeeParamsSchema,
  TriggerEmployeeQuerySchema,
  GetTaskParamsSchema,
} from '../../../src/gateway/validation/schemas.js';

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';
const VALID_UUID_2 = '987fbc97-4bed-5078-af07-9141ba07c9f3';

describe('TriggerEmployeeParamsSchema', () => {
  it('accepts valid UUID tenantId and valid slug', () => {
    const result = TriggerEmployeeParamsSchema.safeParse({
      tenantId: VALID_UUID,
      slug: 'daily-summarizer',
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID tenantId', () => {
    const result = TriggerEmployeeParamsSchema.safeParse({
      tenantId: 'not-a-uuid',
      slug: 'daily-summarizer',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('tenantId');
    }
  });

  it('rejects slug with uppercase letters', () => {
    const result = TriggerEmployeeParamsSchema.safeParse({
      tenantId: VALID_UUID,
      slug: 'Daily-Summarizer',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('slug');
    }
  });

  it('rejects slug with spaces', () => {
    const result = TriggerEmployeeParamsSchema.safeParse({
      tenantId: VALID_UUID,
      slug: 'daily summarizer',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('slug');
    }
  });

  it('accepts slug with numbers and hyphens', () => {
    const result = TriggerEmployeeParamsSchema.safeParse({
      tenantId: VALID_UUID,
      slug: 'employee-v2-test',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty slug', () => {
    const result = TriggerEmployeeParamsSchema.safeParse({
      tenantId: VALID_UUID,
      slug: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('TriggerEmployeeQuerySchema', () => {
  it('parses dry_run="true" as boolean true', () => {
    const result = TriggerEmployeeQuerySchema.safeParse({ dry_run: 'true' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dry_run).toBe(true);
      expect(typeof result.data.dry_run).toBe('boolean');
    }
  });

  it('parses dry_run="false" as boolean false', () => {
    const result = TriggerEmployeeQuerySchema.safeParse({ dry_run: 'false' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dry_run).toBe(false);
      expect(typeof result.data.dry_run).toBe('boolean');
    }
  });

  it('parses missing dry_run as undefined', () => {
    const result = TriggerEmployeeQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dry_run).toBeUndefined();
    }
  });

  it('rejects invalid dry_run value', () => {
    const result = TriggerEmployeeQuerySchema.safeParse({ dry_run: 'yes' });
    expect(result.success).toBe(false);
  });
});

describe('GetTaskParamsSchema', () => {
  it('accepts two valid UUIDs', () => {
    const result = GetTaskParamsSchema.safeParse({
      tenantId: VALID_UUID,
      id: VALID_UUID_2,
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID id', () => {
    const result = GetTaskParamsSchema.safeParse({
      tenantId: VALID_UUID,
      id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('id');
    }
  });

  it('rejects non-UUID tenantId', () => {
    const result = GetTaskParamsSchema.safeParse({
      tenantId: 'bad-tenant',
      id: VALID_UUID_2,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('tenantId');
    }
  });
});
