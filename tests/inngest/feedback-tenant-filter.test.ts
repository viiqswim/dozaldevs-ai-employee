import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('feedback queries — tenant_id filter', () => {
  it('employee-lifecycle.ts feedback query includes tenant_id=eq.${tenantId} filter', () => {
    const src = readFileSync(join(process.cwd(), 'src/inngest/employee-lifecycle.ts'), 'utf-8');
    expect(src).toContain('tenant_id=eq.${tenantId}');
    expect(src).toContain('/rest/v1/feedback?');
  });

  it('feedback-summarizer.ts feedback query includes tenant_id=eq.${archetype.tenant_id} filter', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/inngest/triggers/feedback-summarizer.ts'),
      'utf-8',
    );
    expect(src).toContain('tenant_id=eq.${archetype.tenant_id}');
    expect(src).toContain('/rest/v1/feedback?');
  });

  it('feedback-summarizer.ts does not contain TODO(GM-19) comment (bug was fixed)', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/inngest/triggers/feedback-summarizer.ts'),
      'utf-8',
    );
    expect(src).not.toContain('TODO(GM-19)');
  });
});
